# Counsel Evidence Packet

See also the `FOR_YOUR_ADVOCATE.md` file inside each downloaded ZIP.

## Contents

- `proof-bundle.json` — machine-readable summary with verify instructions
- `section-63-system-certificate.pdf` — BSA 2023 Section 63 system certificate (computer output)
- `creator-declaration.pdf` — RSA-signed creator declaration
- `attestation-record.json` — payload + signature verification record
- `audit-chain.json` — tamper-evident custody log for this stamp
- TSA token and verification files
- `affidavit-template.txt` — draft for advocate review

## Independent verification

- `GET /api/verify/:stampId`
- `GET /stamps/:stampId/proof`

See [INDEPENDENT_VERIFICATION.md](./INDEPENDENT_VERIFICATION.md).
