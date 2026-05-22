import { BSA_FRAME, TSA_BADGES } from '@/content/legalCopy';

export default function LegalEvidenceSummary({ stamp, verification }) {
  if (!stamp) return null;

  const tsaTier = stamp.tsaTier || verification?.tsaTier || 'development';
  const tsaStatus = stamp.tsaVerifyStatus || verification?.tsaVerifyStatus;
  const hasSystemCert = !!(stamp.evidenceCertificateUrl || verification?.hasSystemCertificate || verification?.hasSection63SystemCert);
  const cryptoAttested = !!(
    stamp.creatorAttestationSignature ||
    verification?.creatorAttestation?.cryptographicallyBound
  );
  const legacyAttest = !!(stamp.creatorAttestationAt && !cryptoAttested);

  return (
    <ul className="text-xs space-y-1">
      <li>
        {TSA_BADGES[tsaTier] || TSA_BADGES.development}
        {tsaStatus ? ` (${tsaStatus})` : ''}
      </li>
      <li>SHA-256: {stamp.originalHash?.substring(0, 24)}…</li>
      {hasSystemCert && <li>{BSA_FRAME.shortLabel} on file</li>}
      {cryptoAttested && <li>Creator declaration cryptographically attested (RSA)</li>}
      {legacyAttest && <li>Creator declaration needs re-attestation (RSA signature)</li>}
      {!stamp.creatorAttestationAt && <li>Creator declaration pending</li>}
    </ul>
  );
}
