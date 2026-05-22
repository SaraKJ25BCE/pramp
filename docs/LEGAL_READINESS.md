# Legal readiness checklist (ProofStamp)

## Ten-layer technical stack (in code)

| Layer | Status |
|-------|--------|
| 1 SHA-256 fingerprint | Done |
| 2 RSA stamp signature | Done |
| 3 RSA creator attestation | Done |
| 4 RFC 3161 TSA (development tier) | Done |
| 5 OpenTimestamps Merkle anchor | Done (job enabled; verify before marketing) |
| 6 Hash-chained audit log in packet | Done |
| 7 BSA 2023 Section 63 system certificate | Done |
| 8 Public `/api/verify` + proof bundle | Done |
| 9 Copyright Office guidance | `/register-copyright` page |
| 10 Advocate + affidavit | External — [ADVOCATE_REVIEW_CHECKLIST.md](./ADVOCATE_REVIEW_CHECKLIST.md) |

## External (path to 10/10)

- [ ] Indian advocate reviews PDF templates
- [ ] One redacted [case study](./CASE_STUDY_TEMPLATE.md)
- [ ] TinEye/Vision in production OR marketing never claims web-wide scan

## Environment

```env
TSA_MODE=development
STAMP_QUOTA_DISABLED=false
STAMP_FAIR_USE_MONTHLY=500
BLOCKCHAIN_ANCHOR_DISABLED=false
```
