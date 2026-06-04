const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const {
  LEGAL_SIGNATORY,
  SYSTEM_ATTESTATION,
  CREATOR_ATTESTATION_TEXT,
  CREATOR_ATTESTATION_VERSION,
} = require('../config/legalProof');
const {
  MARKETING,
  BSA_FRAME,
  SYSTEM_CERT_SCOPE,
  CREATOR_DECLARATION_INTRO,
} = require('../content/legalCopy');
const { getTsaVerifyInstructions, verifyTimestampTokenFull } = require('./timestamping');

function getServerUrl() {
  return process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
}

async function drawPdfLines(pdfDoc, lines, options = {}) {
  const { headerMatcher = (line) => line.startsWith('CERTIFICATE') || line.startsWith('SECTION') } =
    options;
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  let currentPage = page;
  for (const line of lines) {
    const isHeader = headerMatcher(line);
    const size = isHeader ? 11 : 9;
    const usedFont = line.match(/^[0-9]\.|COMPUTER|ELECTRONIC|INDEPENDENT|CRYPTO|DECLARATION|SIGNED|LIMITATION/i)
      ? fontBold
      : font;
    if (y < 60) {
      currentPage = pdfDoc.addPage([595, 842]);
      y = 800;
    }
    currentPage.drawText(line.substring(0, 95), {
      x: 50,
      y,
      size,
      font: isHeader ? fontBold : usedFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= line.length > 80 ? 20 : 14;
  }
  return Buffer.from(await pdfDoc.save());
}

async function generateSystem63Pdf(stamp, passport, user, options = {}) {
  const { auditHeadHash = null } = options;
  const {
    buildSystemCertificatePayload,
    signSystemCertificate,
    getPlatformVerifyMeta,
    publicKeyFingerprint,
  } = require('./platformSigning');

  const payload = buildSystemCertificatePayload(stamp, passport, user, auditHeadHash);
  const platformSignature = signSystemCertificate(payload);
  const platformMeta = getPlatformVerifyMeta();
  const { getPlatformPublicKeyPem } = require('./platformSigning');
  const keyFp = publicKeyFingerprint(getPlatformPublicKeyPem());

  const pdfDoc = await PDFDocument.create();
  const lines = [
    'SECTION 63 — SYSTEM CERTIFICATE (ELECTRONIC RECORD)',
    `${BSA_FRAME.act} · Information Technology Act, 2000`,
    '',
    `I, ${LEGAL_SIGNATORY.name}, ${LEGAL_SIGNATORY.title} of ${LEGAL_SIGNATORY.organization},`,
    'certify in respect of the electronic record produced by the computer system described below,',
    'for purposes of admissibility of electronic records under Section 63 of the BSA 2023.',
    '',
    'LIMITATION OF SCOPE',
    SYSTEM_CERT_SCOPE,
    '',
    '1. COMPUTER SYSTEM',
    'The record was produced by the ProofStamp Evidence Platform comprising:',
    '  - Application server (Node.js) computing SHA-256 at upload',
    '  - PostgreSQL database storing immutable stamp records',
    '  - Optional steganography service for image watermarking',
    '  - Cloud object storage for file preservation',
    'The system was operating in the ordinary course of business at the time stated.',
    '',
    '2. ELECTRONIC RECORD (SYSTEM OUTPUT)',
    `  Stamp ID:        ${stamp.id}`,
    `  Title:           ${stamp.title}`,
    `  Registered by:   ${passport.displayName} (@${passport.username || 'n/a'})`,
    `  Account email:   ${user?.email || 'verified via OAuth'}`,
    `  SHA-256 hash:    ${stamp.originalHash}`,
    `  Registered at:   ${new Date(stamp.createdAt).toISOString()}`,
    `  File name:       ${stamp.fileName || 'N/A'}`,
    `  License:         ${stamp.license}`,
    '',
    '3. INDEPENDENT TIMESTAMP (RFC 3161)',
    stamp.tsaTimestamp
      ? `  TSA URL:         ${stamp.tsaUrl || 'N/A'}`
      : '  TSA:             Not available for this stamp',
    stamp.tsaTimestamp
      ? `  Provider:        ${stamp.tsaProviderName || 'N/A'}`
      : '',
    stamp.tsaTimestamp
      ? `  Tier:            ${stamp.tsaTier || 'development'}`
      : '',
    stamp.tsaTimestamp
      ? `  Timestamp (UTC): ${new Date(stamp.tsaTimestamp).toISOString()}`
      : '',
    stamp.tsaVerifyStatus
      ? `  Verify status:   ${stamp.tsaVerifyStatus}`
      : '',
    '',
    '4. CRYPTOGRAPHIC INTEGRITY',
    '  The creator RSA-2048 digital signature over the stamp payload is stored.',
    '  Any alteration to the file changes the SHA-256 fingerprint.',
    '',
    '5. CREATOR DECLARATION (SEPARATE DOCUMENT)',
    stamp.creatorAttestationAt
      ? `  Attested by:     ${stamp.creatorAttestationName} at ${stamp.creatorAttestationAt.toISOString()}`
      : '  Creator declaration not yet attested — download Counsel Evidence Packet after attestation.',
    '',
    '6. SYSTEM OFFICER DECLARATION',
    '  To the best of my knowledge, the computer system described above produced the',
    '  electronic record without unauthorized interference at the stated time.',
    '',
    '7. PLATFORM CRYPTOGRAPHIC SIGNATURE',
    `  This certificate is signed by ProofStamp's platform RSA key (not merely typed text).`,
    `  Verify public key: ${platformMeta.verifyUrl}`,
    `  Public key fingerprint (SHA-256 prefix): ${keyFp}`,
    `  Platform signature (base64): ${platformSignature.substring(0, 64)}…`,
    `  Canonical payload SHA-256: ${require('crypto').createHash('sha256').update(payload, 'utf8').digest('hex')}`,
    auditHeadHash ? `  Audit chain head at issue: ${auditHeadHash}` : '',
    '',
    `Signed: ${LEGAL_SIGNATORY.name}`,
    `${LEGAL_SIGNATORY.title}, ${LEGAL_SIGNATORY.organization}`,
    `Date of issue: ${new Date().toISOString()}`,
  ].filter(Boolean);

  return drawPdfLines(pdfDoc, lines);
}

/** @deprecated use generateSystem63Pdf */
async function generateSystem65bPdf(stamp, passport, user) {
  return generateSystem63Pdf(stamp, passport, user);
}

/** @deprecated alias */
async function generateSection65bPdf(stamp, passport, user) {
  return generateSystem63Pdf(stamp, passport, user);
}

async function generateCreatorDeclarationPdf(stamp, passport, user) {
  const attestedName = stamp.creatorAttestationName || passport.displayName;
  const attestedAt = stamp.creatorAttestationAt || new Date();

  const pdfDoc = await PDFDocument.create();
  const lines = [
    'CREATOR DECLARATION — AUTHORSHIP & RIGHTS',
    `Separate from ProofStamp ${BSA_FRAME.shortLabel}`,
    '',
    CREATOR_DECLARATION_INTRO,
    '',
    `  Full legal name:  ${attestedName}`,
    `  Passport:         ${passport.displayName} (@${passport.username || 'n/a'})`,
    `  Email:            ${user?.email || 'verified via OAuth'}`,
    `  Stamp ID:         ${stamp.id}`,
    `  Work title:       ${stamp.title}`,
    `  SHA-256:          ${stamp.originalHash}`,
    `  Uploaded (UTC):   ${new Date(stamp.createdAt).toISOString()}`,
    '',
    'STATEMENT (version ' + CREATOR_ATTESTATION_VERSION + ')',
    CREATOR_ATTESTATION_TEXT,
    '',
    'ADDITIONAL (takedown context)',
    '  I have not authorized the infringing use described in any takedown notice',
    '  filed using this stamp, except as I have separately documented in writing.',
    '',
    `Attestation recorded: ${attestedAt.toISOString()}`,
    `Statement version:    ${stamp.creatorAttestationStatement || CREATOR_ATTESTATION_VERSION}`,
    '',
    stamp.creatorAttestationSignature
      ? 'CRYPTOGRAPHIC SIGNATURE (RSA-SHA256 over attestation payload)'
      : '',
    stamp.creatorAttestationSignature
      ? `  Signature: ${stamp.creatorAttestationSignature.substring(0, 48)}...`
      : '',
    stamp.creatorAttestationPayload
      ? '  Full payload and signature: attestation-record.json in Counsel Evidence Packet'
      : '',
    '',
    'This declaration is made by the creator. ProofStamp does not verify',
    'authorship beyond account identity and this attestation.',
    '',
    `Signed (typed): ${attestedName}`,
    `Date: ${attestedAt.toISOString()}`,
  ].filter(Boolean);

  return drawPdfLines(pdfDoc, lines, {
    headerMatcher: (line) =>
      line.startsWith('CREATOR') || line.startsWith('Separate') || line.startsWith('STATEMENT'),
  });
}

function buildForYourAdvocateReadme(stamp, passport, baseUrl) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return `# For Your Advocate — ${MARKETING.counselPacketName}

Stamp ID: **${stamp.id}**
Creator: **${passport.displayName}**

## What ProofStamp proves

- **SHA-256 fingerprint** of the file at registration time
- **RFC 3161 trusted timestamp** (independent time witness)
- **Creator RSA-2048 signature** over the stamp payload
- **${BSA_FRAME.shortLabel}** describing how the platform recorded the file
- **Creator declaration** (authorship/rights — separate from system certificate)
- **Audit trail** and verification URLs

## What ProofStamp does not prove

- Litigation outcome or court admissibility without your advocate's review
- Copyright registration (use ${clientUrl}/register-copyright for USCO guidance)
- That no one else created similar work elsewhere

## Recommended next steps

1. Review \`section-63-system-certificate.pdf\` and \`creator-declaration.pdf\`
2. Verify TSA token using \`tsa-verify-instructions.txt\` and \`tsa-verify-result.json\`
3. File or adapt \`affidavit-template.txt\` with a qualified Indian advocate
4. Register copyright where applicable: ${clientUrl}/register-copyright
5. Public verification: ${clientUrl}/verify?id=${stamp.id}
6. API artifacts index: ${baseUrl}/legal/${stamp.id}/artifacts

## Files in this packet

| File | Purpose |
|------|---------|
| proof-bundle.json | Machine-readable evidence summary |
| section-63-system-certificate.pdf | Platform system output (BSA 2023 s.63) |
| attestation-record.json | RSA-signed creator declaration record |
| audit-chain.json | Tamper-evident custody log for this stamp |
| creator-declaration.pdf | Creator authorship/rights attestation |
| system-attestation.json | Platform integrity controls |
| affidavit-template.txt | Draft for advocate review |
| chain-of-custody.md | Event timeline |
| *-tsa-token.tsr | RFC 3161 timestamp token |
| tsa-verify-instructions.txt | OpenSSL verification steps |
| tsa-verify-result.json | Server-side verify snapshot |
| certificate-url.txt | Human-readable certificate link (if any) |

---
ProofStamp · ${new Date().toISOString()}
`;
}

function buildAffidavitTemplate(stamp, passport, user) {
  return `AFFIDAVIT TEMPLATE — CREATOR OWNERSHIP & ELECTRONIC RECORD
(Have a qualified advocate review before filing)

I, ${stamp.creatorAttestationName || passport.displayName}, residing at ____________________________,
email: ${user?.email || '________________'}, do hereby solemnly affirm:

1. I am the author/rights-holder of the work titled "${stamp.title}" (Stamp ID: ${stamp.id}).

2. On ${new Date(stamp.createdAt).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC I uploaded the work to ProofStamp.
   The SHA-256 fingerprint recorded is: ${stamp.originalHash}

3. The electronic record and BSA 2023 Section 63 system certificate issued by ProofStamp accurately
   reflect the file I possessed at that time. My creator declaration is on file.

4. I have not authorized the use complained of (if applicable): _______________________

5. Attached: ProofStamp ${MARKETING.counselPacketName} (proof bundle, timestamp token, certificates).

Place: _______________     Date: _______________
Signature: _______________________
`;
}

function buildChainOfCustody(stamp, passport) {
  return `# Chain of Custody — ${stamp.id}

| Step | Event | Timestamp (UTC) |
|------|-------|-----------------|
| 1 | File received by ProofStamp upload endpoint | ${stamp.createdAt.toISOString()} |
| 2 | SHA-256 computed: \`${stamp.originalHash}\` | ${stamp.createdAt.toISOString()} |
| 3 | Creator RSA signature stored | ${stamp.createdAt.toISOString()} |
| 4 | RFC 3161 TSA token obtained | ${stamp.tsaTimestamp?.toISOString() || 'pending'} |
| 5 | Stamp record committed to database | ${stamp.createdAt.toISOString()} |
| 6 | Creator attestation | ${stamp.creatorAttestationAt?.toISOString() || 'pending'} |
| 7 | Creator Passport | ${passport.id} (${passport.displayName}) |

Verification URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}/verify?id=${stamp.id}
`;
}

function buildArtifactsList(stamp, passport, baseUrl) {
  const hasTsa = !!stamp.tsaToken;
  const hasSystemCert = !!stamp.evidenceCertificateUrl;
  const hasCert = !!stamp.certificateUrl;
  const hasCreatorDecl = !!stamp.creatorDeclarationUrl;
  const attested = !!(
    stamp.creatorAttestationAt &&
    stamp.creatorAttestationSignature
  );

  return {
    stampId: stamp.id,
    jurisdiction: 'India',
    disclaimer: SYSTEM_ATTESTATION.disclaimer,
    creatorAttestation: attested
      ? { attested: true, name: stamp.creatorAttestationName, at: stamp.creatorAttestationAt }
      : { attested: false, requiredForCounselPacket: true },
    claims: [
      {
        claim: 'File fingerprint at registration',
        artifact: 'SHA-256 hash',
        available: true,
        url: null,
        value: stamp.originalHash,
      },
      {
        claim: 'Creator cryptographic identity',
        artifact: 'RSA-2048 signature + public key',
        available: true,
        url: `${baseUrl}/stamps/${stamp.id}/proof`,
      },
      {
        claim: 'Independent time witness (RFC 3161)',
        artifact: 'TSA timestamp token',
        available: hasTsa,
        url: hasTsa ? `${baseUrl}/tsa/token/${stamp.id}` : null,
        verifyUrl: `${baseUrl}/tsa/verify/${stamp.id}`,
        tier: stamp.tsaTier,
        provider: stamp.tsaProviderName,
      },
      {
        claim: 'Electronic record — system output (BSA 2023 s.63)',
        artifact: BSA_FRAME.shortLabel,
        available: hasSystemCert,
        url: hasSystemCert ? stamp.evidenceCertificateUrl : `${baseUrl}/legal/${stamp.id}/system-certificate`,
      },
      {
        claim: 'Creator authorship and rights',
        artifact: 'Creator declaration PDF',
        available: hasCreatorDecl,
        url: hasCreatorDecl
          ? stamp.creatorDeclarationUrl
          : `${baseUrl}/legal/${stamp.id}/creator-declaration`,
        requiresAttestation: !attested,
      },
      {
        claim: 'Human-readable authenticity summary',
        artifact: 'Certificate of authenticity PDF',
        available: hasCert,
        url: stamp.certificateUrl,
      },
      {
        claim: MARKETING.counselPacketName,
        artifact: 'Counsel evidence packet (ZIP)',
        available: attested,
        url: attested ? `${baseUrl}/legal/${stamp.id}/litigation-pack` : null,
        note: attested ? null : 'Complete creator attestation before download',
      },
      {
        claim: 'Creator key custody',
        artifact: 'RSA keypair (export via authenticated endpoint)',
        available: true,
        url: `${baseUrl}/passport/me/export-private-key`,
        note: 'POST with confirmation — private key held encrypted, exportable by creator',
      },
    ],
    systemAttestation: SYSTEM_ATTESTATION,
    creator: {
      passportId: passport.id,
      displayName: passport.displayName,
      username: passport.username,
    },
  };
}

async function buildLitigationPackZip(stamp, passport, user, proofBundleJson, options = {}) {
  const {
    systemCertBuffer,
    creatorDeclarationBuffer,
    baseUrl = getServerUrl(),
  } = options;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    const tsTokenBuf = stamp.tsaToken
      ? Buffer.isBuffer(stamp.tsaToken)
        ? stamp.tsaToken
        : Buffer.from(stamp.tsaToken)
      : null;

    archive.append(buildForYourAdvocateReadme(stamp, passport, baseUrl), {
      name: 'FOR_YOUR_ADVOCATE.md',
    });
    archive.append(JSON.stringify(proofBundleJson, null, 2), { name: 'proof-bundle.json' });
    archive.append(JSON.stringify(SYSTEM_ATTESTATION, null, 2), { name: 'system-attestation.json' });
    archive.append(buildAffidavitTemplate(stamp, passport, user), { name: 'affidavit-template.txt' });
    archive.append(buildChainOfCustody(stamp, passport), { name: 'chain-of-custody.md' });
    archive.append(getTsaVerifyInstructions().replace(/\{stampId\}/g, stamp.id), {
      name: 'tsa-verify-instructions.txt',
    });

    if (systemCertBuffer) {
      archive.append(systemCertBuffer, { name: 'bsa-section63-system-certificate.pdf' });
    }

    if (options.attestationRecord) {
      archive.append(JSON.stringify(options.attestationRecord, null, 2), { name: 'attestation-record.json' });
    }

    if (options.auditChainExport) {
      archive.append(JSON.stringify(options.auditChainExport, null, 2), { name: 'audit-log.json' });
      if (options.auditChainVerificationText) {
        archive.append(options.auditChainVerificationText, { name: 'audit-chain-verification.txt' });
      }
    }

    if (creatorDeclarationBuffer) {
      archive.append(creatorDeclarationBuffer, { name: 'creator-declaration.pdf' });
    }

    if (stamp.certificateUrl) {
      archive.append(`Certificate PDF: ${stamp.certificateUrl}\n`, { name: 'certificate-url.txt' });
    }

    if (tsTokenBuf) {
      archive.append(tsTokenBuf, { name: 'tsa-token.tsr' });
      const verify = verifyTimestampTokenFull(tsTokenBuf, stamp.originalHash);
      archive.append(JSON.stringify(verify, null, 2), { name: 'tsa-verify-result.json' });
    }

    archive.finalize();
  });
}

async function saveEvidencePdf(buffer, stampId, subdir = 'evidence', suffix = '63-system') {
  const uploadsDir = path.join(__dirname, '../../uploads', subdir);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, `${stampId}-${suffix}.pdf`);
  fs.writeFileSync(filePath, buffer);
  const baseUrl = getServerUrl();
  return `${baseUrl}/uploads/${subdir}/${stampId}-${suffix}.pdf`;
}

module.exports = {
  generateSystem63Pdf,
  generateSystem65bPdf,
  generateSection65bPdf,
  generateCreatorDeclarationPdf,
  buildForYourAdvocateReadme,
  buildAffidavitTemplate,
  buildChainOfCustody,
  buildArtifactsList,
  buildLitigationPackZip,
  saveEvidencePdf,
};
