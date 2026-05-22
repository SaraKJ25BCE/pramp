# Independent verification (without trusting the ProofStamp UI)

## Public JSON API

```bash
curl -s "http://localhost:3001/api/verify/PS-YYYY-XXXXX" | jq .
```

## Proof bundle

```bash
curl -s "http://localhost:3001/stamps/PS-YYYY-XXXXX/proof" | jq .
```

## SHA-256

```bash
sha256sum your-file.png
# compare to original_hash / file.sha256
```

## RSA stamp signature

Use `protection.signature` and `creator.publicKey` (or `public_key` from API verify) with your tool verifying RSA-SHA256 over `metadata.signPayload` in proof bundle.

## Creator attestation

Verify `creatorAttestation.payload` against `creatorAttestation.signature` with the same public key. See `attestation-record.json` in the counsel ZIP.

## RFC 3161 TSA

```bash
curl -o stamp.tsr "http://localhost:3001/tsa/token/PS-YYYY-XXXXX"
# Follow tsa-verify-instructions.txt in counsel packet (OpenSSL ts -verify)
```

## Audit chain

Load `audit-chain.json` from counsel packet. Recompute each `entryHash` from canonical fields; confirm `previousLogHash` chain from `GENESIS`.

## OpenTimestamps anchor

If `blockchainAnchors` is non-empty and not `local:` pending, verify Merkle proof per `merkleProof` against `merkleRoot`.
