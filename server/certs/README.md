# TSA CA certificates

| File | Purpose |
|------|---------|
| `freetsa-cacert.pem` | FreeTSA root CA — used by OpenSSL to verify timestamp token signatures |
| `freetsa-tsa.pem` | FreeTSA TSA signing certificate (reference / backup chain check) |

Bundled by default when `TSA_CA_CERT_PATH` is unset or `./certs/freetsa-cacert.pem`.

Refresh periodically:

```bash
curl -fsSL https://www.freetsa.org/files/cacert.pem -o freetsa-cacert.pem
curl -fsSL https://www.freetsa.org/files/tsa.crt -o freetsa-tsa.pem
```

For a commercial TSA (DigiCert, GlobalSign, etc.), replace this file or set `TSA_CA_CERT_PATH` / `TSA_CA_CERT_PEM` in `.env`.
