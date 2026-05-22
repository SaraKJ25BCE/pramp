const { verifyMerkleProof } = require('../jobs/blockchainAnchor');

function isVerifiableAnchor(anchor, stampAnchor) {
  if (!anchor || !stampAnchor) return false;
  if (anchor.blockchainStatus !== 'confirmed') return false;
  if (!anchor.txHash || anchor.txHash.startsWith('local:')) return false;
  return true;
}

function formatAnchorsForProof(stampAnchors) {
  if (!stampAnchors?.length) return [];

  return stampAnchors
    .filter((sa) => isVerifiableAnchor(sa.anchor, sa))
    .map((sa) => {
      const proof = JSON.parse(sa.merkleProof);
      const merkleValid = verifyMerkleProof(sa.leafHash, proof, sa.anchor.merkleRoot);
      return {
        chain: sa.anchor.chain,
        txHash: sa.anchor.txHash,
        merkleRoot: sa.anchor.merkleRoot,
        merkleProof: proof,
        leafHash: sa.leafHash,
        anchoredAt: sa.anchor.anchoredAt.toISOString(),
        merkleValid,
        verifyNote:
          sa.anchor.chain === 'opentimestamps'
            ? 'OpenTimestamps calendar anchor; verify .ots receipt and Merkle path'
            : 'Verify transaction on public explorer',
      };
    });
}

module.exports = { isVerifiableAnchor, formatAnchorsForProof };
