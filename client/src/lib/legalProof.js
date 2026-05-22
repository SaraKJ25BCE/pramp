import { MARKETING, TSA_BADGES } from '@/content/legalCopy';

const API_URL = import.meta.env.VITE_API_URL;

export async function downloadCounselPacket(stampId) {
  const token = localStorage.getItem('proofstamp_token');
  const res = await fetch(`${API_URL}/legal/${stampId}/litigation-pack`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Download failed');
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${stampId}-counsel-evidence-packet.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** @deprecated use downloadCounselPacket */
export const downloadLitigationPack = downloadCounselPacket;

export async function attestCreator(stampId, { fullName, city, country }) {
  const token = localStorage.getItem('proofstamp_token');
  const res = await fetch(`${API_URL}/legal/${stampId}/attest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      fullName,
      city,
      country,
      confirm: true,
      statementConfirm: true,
      statementVersion: '2.0',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Attestation failed');
  return data;
}

export function legalStatusBadges(stamp) {
  const badges = [];
  const tier = stamp.tsaTier || 'development';
  const tsaPending = stamp.tsaStatus === 'pending' || (!stamp.tsaToken && stamp.tsaVerifyStatus !== 'valid');
  badges.push({
    label: tsaPending
      ? 'Timestamp pending — retrying within 1 hour'
      : TSA_BADGES[tier] || TSA_BADGES.development,
    variant: stamp.tsaVerifyStatus === 'valid' && !tsaPending ? 'success' : 'secondary',
  });
  if (stamp.evidenceCertificateUrl) {
    badges.push({ label: 'BSA s.63 cert', variant: 'success' });
  }
  if (stamp.creatorAttestationAt) {
    badges.push({ label: 'Creator attested', variant: 'success' });
  }
  return badges;
}

export { MARKETING };
