const crypto = require('crypto');
const cron = require('node-cron');
const prisma = require('../config/prisma');

function buildMerkleTree(hashes) {
  if (hashes.length === 0) return { root: null, proofs: [] };
  if (hashes.length === 1) {
    return { root: hashes[0], proofs: [[]] };
  }

  const leaves = [...hashes];
  if (leaves.length % 2 !== 0) {
    leaves.push(leaves[leaves.length - 1]);
  }

  const proofs = leaves.map(() => []);
  let currentLevel = leaves.map((h, i) => ({ hash: h, indices: [i] }));

  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] || left;

      const combined = crypto.createHash('sha256')
        .update(Buffer.from(left.hash + right.hash, 'hex'))
        .digest('hex');

      for (const idx of left.indices) {
        proofs[idx].push({ position: 'right', hash: right.hash });
      }
      for (const idx of right.indices) {
        if (right !== left) {
          proofs[idx].push({ position: 'left', hash: left.hash });
        }
      }

      nextLevel.push({
        hash: combined,
        indices: [...left.indices, ...(right !== left ? right.indices : [])],
      });
    }
    currentLevel = nextLevel;
  }

  return { root: currentLevel[0].hash, proofs };
}

function verifyMerkleProof(leafHash, proof, root) {
  let current = leafHash;
  for (const node of proof) {
    if (node.position === 'right') {
      current = crypto.createHash('sha256')
        .update(Buffer.from(current + node.hash, 'hex'))
        .digest('hex');
    } else {
      current = crypto.createHash('sha256')
        .update(Buffer.from(node.hash + current, 'hex'))
        .digest('hex');
    }
  }
  return current === root;
}

async function submitOts(rootHex) {
  const OpenTimestamps = require('opentimestamps');
  const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
    new OpenTimestamps.Ops.OpSHA256(),
    Buffer.from(rootHex, 'hex')
  );
  await OpenTimestamps.stamp(detached);
  return Buffer.from(detached.serializeToBytes());
}

async function anchorDailyBatch() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unanchored = await prisma.stamp.findMany({
      where: {
        createdAt: { gte: since },
        stampAnchors: { none: {} },
      },
      select: { id: true, originalHash: true },
      orderBy: { createdAt: 'asc' },
    });

    if (unanchored.length === 0) {
      console.log('[BlockchainAnchor] No unanchored stamps found');
      return null;
    }

    console.log(`[BlockchainAnchor] Anchoring ${unanchored.length} stamps`);

    const hashes = unanchored.map((s) => s.originalHash);
    const { root, proofs } = buildMerkleTree(hashes);
    if (!root) return null;

    let otsPendingBytes = null;
    let txHash = 'pending';
    let chain = 'opentimestamps';
    let blockchainStatus = 'pending';

    try {
      otsPendingBytes = await submitOts(root);
      txHash = `ots:${crypto.createHash('sha256').update(otsPendingBytes).digest('hex').slice(0, 32)}`;
    } catch (otsErr) {
      console.warn('[BlockchainAnchor] OTS submit failed — skipping anchor row:', otsErr.message);
      return null;
    }

    const anchor = await prisma.blockchainAnchor.create({
      data: {
        chain,
        txHash,
        merkleRoot: root,
        anchoredAt: new Date(),
        stampCount: unanchored.length,
        blockchainStatus,
        otsPendingBytes,
      },
    });

    await prisma.stampAnchor.createMany({
      data: unanchored.map((stamp, i) => ({
        stampId: stamp.id,
        anchorId: anchor.id,
        merkleProof: JSON.stringify(proofs[i]),
        leafHash: stamp.originalHash,
      })),
    });

    console.log(`[BlockchainAnchor] Submitted OTS for ${unanchored.length} stamps. Root: ${root}`);
    return anchor;
  } catch (err) {
    console.error('[BlockchainAnchor] Batch anchor failed:', err);
    return null;
  }
}

function startBlockchainAnchorJob() {
  cron.schedule('0 2 * * *', async () => {
    console.log('[BlockchainAnchor] Running daily batch...');
    await anchorDailyBatch();
  });
  console.log('[BlockchainAnchor] Daily anchor job scheduled (2:00 AM)');
}

module.exports = {
  anchorDailyBatch,
  startBlockchainAnchorJob,
  buildMerkleTree,
  verifyMerkleProof,
};
