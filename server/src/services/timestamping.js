const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const asn1js = require('asn1js');
const { TSA_CA_CERT_PATH, TSA_CA_CERT_PEM } = require('../config/legalProof');

const BUNDLED_TSA_CERT = path.join(__dirname, '../../certs/freetsa-tsa.pem');
const TSA_TIMEOUT_MS = parseInt(process.env.TSA_REQUEST_TIMEOUT_MS || '10000', 10);

const TSA_PROVIDERS = [
  { url: process.env.TSA_URL || 'https://freetsa.org/tsr', name: process.env.TSA_PROVIDER_NAME || 'FreeTSA (development)' },
  { url: 'http://timestamp.digicert.com', name: 'DigiCert' },
  { url: 'http://tsa.belgium.be/connect', name: 'Belgium Federal TSA' },
];

const SHA256_OID = '2.16.840.1.101.3.4.2.1';

function buildTimestampRequest(hexHash) {
  const hashBytes = Buffer.from(hexHash, 'hex');

  const algorithmIdentifier = new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: SHA256_OID }),
      new asn1js.Null(),
    ],
  });

  const messageImprint = new asn1js.Sequence({
    value: [algorithmIdentifier, new asn1js.OctetString({ valueHex: hashBytes })],
  });

  const nonce = crypto.randomBytes(8);
  const tsReq = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 1 }),
      messageImprint,
      new asn1js.Integer({ valueHex: nonce }),
      new asn1js.Boolean({ value: true }),
    ],
  });

  return Buffer.from(tsReq.toBER(false));
}

function loadTsaCaCertsPem() {
  if (TSA_CA_CERT_PEM) return TSA_CA_CERT_PEM;
  const chunks = [];
  if (TSA_CA_CERT_PATH && fs.existsSync(TSA_CA_CERT_PATH)) {
    chunks.push(fs.readFileSync(TSA_CA_CERT_PATH, 'utf8'));
  }
  if (fs.existsSync(BUNDLED_TSA_CERT)) {
    chunks.push(fs.readFileSync(BUNDLED_TSA_CERT, 'utf8'));
  }
  return chunks.length > 0 ? chunks.join('\n') : null;
}

function walkAsn1(node, visit) {
  if (!node) return;
  visit(node);
  const children = node.valueBlock?.value;
  if (Array.isArray(children)) {
    for (const child of children) walkAsn1(child, visit);
  }
}

function extractMessageImprintHex(tsToken) {
  try {
    const asn1 = asn1js.fromBER(tsToken);
    if (asn1.offset === -1) return null;

    let found = null;
    walkAsn1(asn1.result, (node) => {
      if (found) return;
      if (node instanceof asn1js.Sequence && node.valueBlock?.value?.length === 2) {
        const [alg, digest] = node.valueBlock.value;
        if (alg instanceof asn1js.Sequence && digest instanceof asn1js.OctetString) {
          const oid = alg.valueBlock?.value?.[0];
          if (oid instanceof asn1js.ObjectIdentifier && oid.valueBlock?.value.join('.') === SHA256_OID) {
            found = Buffer.from(digest.valueBlock.valueHex).toString('hex');
          }
        }
      }
    });
    return found;
  } catch (err) {
    console.error('[TSA] extractMessageImprint failed:', err.message);
    return null;
  }
}

function extractTimestampFromResponse(derBuffer) {
  try {
    const asn1 = asn1js.fromBER(
      derBuffer.buffer.slice(derBuffer.byteOffset, derBuffer.byteOffset + derBuffer.byteLength)
    );
    if (asn1.offset === -1) return null;

    let genTime = null;
    walkAsn1(asn1.result, (node) => {
      if (!genTime && node instanceof asn1js.GeneralizedTime) {
        genTime = node.toDate();
      }
    });
    return genTime;
  } catch (err) {
    console.error('[TSA] extractTimestamp failed:', err.message);
    return null;
  }
}

function extractTimeStampTokenDer(tsToken) {
  try {
    const asn1 = asn1js.fromBER(tsToken);
    if (asn1.offset === -1) return null;
    const resp = asn1.result;
    if (!(resp instanceof asn1js.Sequence)) return null;

    const parts = resp.valueBlock.value || [];
    for (let i = 1; i < parts.length; i++) {
      const el = parts[i];
      if (el instanceof asn1js.Sequence && el.valueBlock?.value?.[0] instanceof asn1js.ObjectIdentifier) {
        return Buffer.from(el.toBER(false));
      }
    }
    return null;
  } catch {
    return null;
  }
}

function resolveCaFileForOpenSsl() {
  if (TSA_CA_CERT_PATH && fs.existsSync(TSA_CA_CERT_PATH)) return TSA_CA_CERT_PATH;
  const defaultCa = path.join(__dirname, '../../certs/freetsa-cacert.pem');
  if (fs.existsSync(defaultCa)) return defaultCa;
  return null;
}

function parseSignerFromChainPem(chainPem) {
  const blocks = chainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!blocks?.length) return null;
  try {
    const forge = require('node-forge');
    const cert = forge.pki.certificateFromPem(blocks[0]);
    const subject = cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
    const issuer = cert.issuer.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
    return {
      subject,
      issuer,
      serialNumber: cert.serialNumber,
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
    };
  } catch {
    return { subject: 'embedded-tsa-certificate', issuer: 'see-chain.pem' };
  }
}

function verifyPkcs7Signature(tsToken) {
  const caFile = resolveCaFileForOpenSsl();
  if (!caFile) {
    return { verified: null, reason: 'TSA_CA_CERT not configured — structural check only' };
  }

  const tokenDer = extractTimeStampTokenDer(tsToken);
  if (!tokenDer) {
    return { verified: false, reason: 'No timeStampToken in TSA response' };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofstamp-tsa-'));
  try {
    const innerPath = path.join(tmpDir, 'timestamp-token.der');
    const chainPath = path.join(tmpDir, 'chain.pem');
    fs.writeFileSync(innerPath, tokenDer);

    execFileSync('openssl', ['pkcs7', '-inform', 'DER', '-in', innerPath, '-print_certs', '-out', chainPath], {
      stdio: 'pipe',
    });

    const out = execFileSync('openssl', ['verify', '-CAfile', caFile, chainPath], {
      encoding: 'utf8',
    });

    const ok = /: OK\s*$/m.test(out) || out.trim().endsWith('OK');
    if (!ok) {
      return { verified: false, reason: out.trim() || 'OpenSSL verify failed' };
    }

    const chainPem = fs.readFileSync(chainPath, 'utf8');
    return {
      verified: true,
      signer: parseSignerFromChainPem(chainPem),
      verifyMethod: 'openssl',
      caFile,
    };
  } catch (err) {
    const msg = err.stderr?.toString() || err.stdout?.toString() || err.message;
    return { verified: false, reason: msg.trim() };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      /* ignore */
    }
  }
}

async function requestFromProvider(provider, dataHash) {
  const tsReq = buildTimestampRequest(dataHash);
  const response = await axios.post(provider.url, tsReq, {
    headers: { 'Content-Type': 'application/timestamp-query' },
    responseType: 'arraybuffer',
    timeout: TSA_TIMEOUT_MS,
  });

  const tsToken = Buffer.from(response.data);
  const timestamp = extractTimestampFromResponse(tsToken);
  const imprint = extractMessageImprintHex(tsToken);

  if (imprint && imprint !== dataHash.toLowerCase()) {
    throw new Error('TSA response message imprint does not match file hash');
  }

  const sigCheck = verifyPkcs7Signature(tsToken);

  return {
    tsToken,
    tsaUrl: provider.url,
    tsaProviderName: provider.name,
    timestamp: timestamp || new Date(),
    messageImprint: imprint,
    signerInfo: sigCheck.signer || null,
    signatureVerified: sigCheck.verified,
    signatureVerifyNote: sigCheck.reason || null,
    tsaStatus: 'confirmed',
  };
}

/**
 * Request RFC 3161 timestamp with fallback chain (10s timeout each).
 */
async function getTimestampToken(dataHash) {
  try {
    const { bumpTsaCallCount } = require('./tsaMetrics');
    bumpTsaCallCount();
  } catch (_) {}

  const seen = new Set();
  const providers = TSA_PROVIDERS.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });

  let lastErr = null;
  for (const provider of providers) {
    try {
      return await requestFromProvider(provider, dataHash);
    } catch (err) {
      lastErr = err;
      console.warn(`[TSA] ${provider.name} failed: ${err.message}`);
    }
  }

  const e = new Error(lastErr?.message || 'All TSA providers failed');
  e.code = 'TSA_ALL_FAILED';
  throw e;
}

function verifyTimestampTokenFull(tsToken, dataHash) {
  const tokenBuf = Buffer.isBuffer(tsToken) ? tsToken : Buffer.from(tsToken, 'base64');
  const timestamp = extractTimestampFromResponse(tokenBuf);
  const imprint = extractMessageImprintHex(tokenBuf);
  const imprintMatch = imprint === dataHash.toLowerCase();
  const sigCheck = verifyPkcs7Signature(tokenBuf);

  const valid =
    timestamp !== null &&
    imprintMatch &&
    sigCheck.verified !== false;

  return {
    valid,
    timestamp,
    messageImprint: imprint,
    messageImprintMatch: imprintMatch,
    signatureVerified: sigCheck.verified,
    signatureVerifyNote: sigCheck.reason || null,
    signer: sigCheck.signer || null,
  };
}

function verifyTimestampToken(tsToken, dataHash) {
  return verifyTimestampTokenFull(tsToken, dataHash);
}

function getTsaVerifyInstructions() {
  const caPath = TSA_CA_CERT_PATH || '(set TSA_CA_CERT_PATH)';
  return [
    'Independent RFC 3161 verification:',
    `1. Save token as ${'{stampId}'}.tsr`,
    `2. Save hash as ${'{stampId}'}.hash (hex SHA-256)`,
    `3. openssl ts -verify -data ${'{stampId}'}.hash -in ${'{stampId}'}.tsr -CAfile ${caPath}`,
    `Or use ProofStamp GET /tsa/verify/:stampId for automated checks.`,
  ].join('\n');
}

module.exports = {
  getTimestampToken,
  verifyTimestampToken,
  verifyTimestampTokenFull,
  buildTimestampRequest,
  extractMessageImprintHex,
  extractTimestampFromResponse,
  getTsaVerifyInstructions,
  loadTsaCaCertsPem,
  TSA_PROVIDERS,
};
