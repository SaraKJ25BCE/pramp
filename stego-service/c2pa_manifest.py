"""
C2PA (Content Credentials) manifest creation and embedding.

Embeds industry-standard content provenance manifests into images so that
C2PA-aware tools (Adobe Photoshop, Content Credentials Verify, etc.)
can validate ownership and AI training opt-out status.

Requires: c2pa-python >= 0.6.0
"""

import io
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

try:
    from c2pa import Builder, Reader, SigningAlg, create_signer
    C2PA_AVAILABLE = True
except ImportError:
    C2PA_AVAILABLE = False


# Path to the signing certificate and private key for C2PA
# These should be proper X.509 certificates (self-signed for dev, CA-issued for production)
C2PA_CERT_PATH = os.environ.get('C2PA_CERT_PATH', '')
C2PA_KEY_PATH = os.environ.get('C2PA_KEY_PATH', '')


def generate_self_signed_cert():
    """
    Generate a self-signed certificate for C2PA signing (development use).
    In production, use a certificate from a CA on the C2PA Trust List.
    """
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        import datetime as dt

        key = ec.generate_private_key(ec.SECP256R1())

        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "ProofStamp"),
            x509.NameAttribute(NameOID.COMMON_NAME, "ProofStamp C2PA Signing"),
        ])

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(dt.datetime.now(dt.timezone.utc))
            .not_valid_after(dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=365))
            .sign(key, hashes.SHA256())
        )

        cert_pem = cert.public_bytes(serialization.Encoding.PEM)
        key_pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )

        return cert_pem, key_pem
    except ImportError:
        return None, None


def _get_signing_materials():
    """Load or generate the signing certificate and key."""
    if C2PA_CERT_PATH and C2PA_KEY_PATH and os.path.exists(C2PA_CERT_PATH):
        cert_pem = Path(C2PA_CERT_PATH).read_bytes()
        key_pem = Path(C2PA_KEY_PATH).read_bytes()
        return cert_pem, key_pem

    # Fallback: generate self-signed cert
    cert_pem, key_pem = generate_self_signed_cert()
    if cert_pem is None:
        raise RuntimeError(
            "C2PA signing requires either configured certificates "
            "(C2PA_CERT_PATH, C2PA_KEY_PATH) or the 'cryptography' package for self-signed certs"
        )

    # Cache to temp files for the session
    cert_dir = Path(tempfile.gettempdir()) / "proofstamp_c2pa"
    cert_dir.mkdir(exist_ok=True)
    (cert_dir / "cert.pem").write_bytes(cert_pem)
    (cert_dir / "key.pem").write_bytes(key_pem)

    return cert_pem, key_pem


def create_c2pa_manifest(
    image_bytes: bytes,
    stamp_id: str,
    creator_name: str,
    creator_handle: str,
    timestamp: str | None = None,
    title: str = "",
    license_name: str = "All Rights Reserved",
    do_not_train: bool = True,
    is_human_created: bool = True,
    output_format: str = "image/png",
) -> bytes | None:
    """
    Create and embed a C2PA manifest into an image.

    Args:
        image_bytes: Original image file bytes
        stamp_id: ProofStamp ID (e.g., PS-2026-ABCDE)
        creator_name: Display name of the creator
        creator_handle: @username
        timestamp: ISO timestamp string (defaults to now)
        title: Title of the work
        license_name: License identifier
        do_not_train: Whether to include do-not-train assertion
        output_format: MIME type for output (image/png or image/jpeg)

    Returns:
        Bytes of the image with embedded C2PA manifest, or None if C2PA unavailable
    """
    if not C2PA_AVAILABLE:
        return None

    if timestamp is None:
        timestamp = datetime.now(timezone.utc).isoformat()

    assertions = [
        {
            "label": "c2pa.actions",
            "data": {
                "actions": [
                    {
                        "action": "c2pa.created",
                        "when": timestamp,
                        "softwareAgent": "ProofStamp/1.0",
                    }
                ]
            },
        },
        {
            "label": "stds.schema-org.CreativeWork",
            "data": {
                "@type": "CreativeWork",
                "@context": "https://schema.org",
                "author": [
                    {
                        "@type": "Person",
                        "name": creator_name,
                        "identifier": creator_handle,
                    }
                ],
                "name": title,
                "license": license_name,
                "copyrightHolder": {
                    "@type": "Person",
                    "name": creator_name,
                },
            },
        },
        {
            "label": "proofstamp.provenance",
            "data": {
                "origin": "Human Created" if is_human_created else "AI Generated",
                "verifiedBy": "ProofStamp"
            }
        }
    ]

    if do_not_train:
        assertions.append({
            "label": "c2pa.training-mining",
            "data": {
                "entries": [
                    {
                        "use": "notAllowed",
                        "constraint_info": (
                            f"This work is registered in the ProofStamp AI Training Opt-Out Registry "
                            f"(Stamp ID: {stamp_id}). Use for AI/ML training without explicit "
                            f"written permission from {creator_handle} is prohibited."
                        ),
                    }
                ]
            },
        })

    manifest_def = {
        "claim_generator": "ProofStamp/1.0",
        "title": f"{title} [{stamp_id}]",
        "assertions": assertions,
    }

    try:
        cert_pem, key_pem = _get_signing_materials()

        signer = create_signer(
            cert=cert_pem,
            key=key_pem,
            alg=SigningAlg.ES256,
            tsa_url="http://timestamp.digicert.com",
        )

        builder = Builder(json.dumps(manifest_def))

        # Determine input/output format
        fmt = "image/png" if output_format == "image/png" else "image/jpeg"

        input_stream = io.BytesIO(image_bytes)
        output_stream = io.BytesIO()

        builder.sign(signer, fmt, input_stream, output_stream)

        return output_stream.getvalue()

    except Exception as e:
        print(f"[C2PA] Manifest creation failed: {e}")
        return None


def read_c2pa_manifest(image_bytes: bytes) -> dict | None:
    """
    Read and parse a C2PA manifest from an image.

    Returns:
        Dictionary with manifest data, or None if no manifest found
    """
    if not C2PA_AVAILABLE:
        return None

    try:
        reader = Reader("image/png", io.BytesIO(image_bytes))
        manifest_store = json.loads(reader.json())
        return manifest_store
    except Exception:
        return None
