function buildVerifyInstructions(baseUrl, stampId) {
  return {
    hash: 'Compute SHA-256 of the original file; compare to file.sha256 in proof bundle',
    rsa: 'Verify protection.signature against creator publicKey using RSA-SHA256',
    attestation:
      'Verify creatorAttestation.payload signature with the same publicKey (see attestation-record.json)',
    tsa: `Download token: ${baseUrl}/tsa/token/${stampId} — verify with openssl ts -verify (see tsa-verify-instructions.txt)`,
    tsaVerifyUrl: `${baseUrl}/tsa/verify/${stampId}`,
    blockchain:
      'If blockchainAnchors present: verify Merkle proof against merkleRoot; for opentimestamps verify calendar receipt',
    auditChain:
      'Load audit-chain.json; recompute entry hashes and previousLogHash chain from GENESIS',
    publicEndpoints: {
      proofBundle: `${baseUrl}/stamps/${stampId}/proof`,
      apiVerify: `${baseUrl}/api/verify/${stampId}`,
      artifacts: `${baseUrl}/legal/${stampId}/artifacts`,
    },
  };
}

module.exports = { buildVerifyInstructions };
