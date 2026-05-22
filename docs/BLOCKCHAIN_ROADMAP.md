# Blockchain anchoring roadmap

## Current (v1)

- Daily Merkle batch via OpenTimestamps (Bitcoin calendar)
- Stored in `BlockchainAnchor` + `StampAnchor`
- Only shown in proof bundle when anchor is verifiable (not `local:` pending)

## Future (optional)

- Polygon or other L2 per-stamp commit for public explorer UX
- Requires wallet, RPC, cost model, and privacy review

Do not use mock transaction hashes in production.
