# Verification & Legal Evidence Guide

This guide explains how to independently verify ProofStamp artifacts and use them in formal disputes.

## Independent Verification (Zero-Trust)

You do not need to trust the ProofStamp UI to verify a stamp. 

### Public JSON API
```bash
curl -s "http://localhost:3001/api/verify/PS-YYYY-XXXXX" | jq .
```

### Proof Bundle JSON
```bash
curl -s "http://localhost:3001/stamps/PS-YYYY-XXXXX/proof" | jq .
```

### 1. SHA-256 File Verification
```bash
sha256sum your-file.png
# compare to original_hash / file.sha256
```

### 2. RSA Cryptographic Signature
Use `protection.signature` and `creator.publicKey` (or `public_key` from API verify) with your tool verifying RSA-SHA256 over `metadata.signPayload` in proof bundle.

### 3. Creator Attestation
Verify `creatorAttestation.payload` against `creatorAttestation.signature` with the same public key. See `attestation-record.json` in the counsel ZIP.

### 4. RFC 3161 Timestamp (TSA)
```bash
curl -o stamp.tsr "http://localhost:3001/tsa/token/PS-YYYY-XXXXX"
# Follow tsa-verify-instructions.txt in counsel packet (OpenSSL ts -verify)
```

### 5. Hash-Chained Audit Log
Load `audit-chain.json` from the counsel packet. Recompute each `entryHash` from canonical fields; confirm `previousLogHash` chain from `GENESIS`.

---

## Counsel Evidence Packet (Litigation Pack)

When generating a Counsel Evidence Packet, the system exports a ZIP containing:

- `proof-bundle.json` — machine-readable summary with verify instructions
- `section-63-system-certificate.pdf` — BSA 2023 Section 63 system certificate (computer output)
- `creator-declaration.pdf` — RSA-signed creator declaration
- `attestation-record.json` — payload + signature verification record
- `audit-chain.json` — tamper-evident custody log for this stamp
- TSA token and verification files
- `affidavit-template.txt` — draft for advocate review

## Advocate Review Checklist (India)

Have a qualified Indian advocate review before relying on ProofStamp artifacts in court or formal disputes.

### System Certificate (BSA 2023, Section 63)
- [ ] Wording correctly cites **Bharatiya Sakshya Adhiniyam, 2023, Section 63** (not repealed Indian Evidence Act s.65B alone)
- [ ] Certifier role (system records officer) is appropriate for **computer output**, not authorship
- [ ] IT Act 2000 cross-reference is accurate for electronic records
- [ ] Limitation-of-scope disclaimer is sufficient

### Creator Declaration
- [ ] Declaration text matches your client's factual situation
- [ ] RSA attestation binding to Passport key is explained to client
- [ ] Client understands typed name + cryptographic sign is not a sworn affidavit filed in court

### Counsel Evidence Packet
- [ ] `FOR_YOUR_ADVOCATE.md` and file index are complete for the matter
- [ ] TSA tier (development vs commercial) is acceptable for this dispute's stakes
- [ ] Audit chain and OpenTimestamps anchor (if present) are explained to the court strategy
