/**
 * Canonical legal/marketing copy — keep server PDFs and API messages aligned.
 */

const LEGAL_COPY_VERSION = '3.0';

const BSA_FRAME = {
  act: 'Bharatiya Sakshya Adhiniyam, 2023',
  section: 'Section 63',
  shortLabel: 'BSA 2023 Section 63 system certificate',
  colloquialLabel: '65B-style system certificate (BSA 2023 s.63)',
};

const MARKETING = {
  heroBadge: 'Admissibility-oriented evidence for Indian creators',
  heroSub:
    'ProofStamp builds an evidence packet for your advocate on every upload: RFC 3161 timestamp, BSA 2023 Section 63 system certificate, creator declaration, and cryptographic integrity.',
  stampSuccessTitle: 'Evidence registered',
  stampSuccessSub:
    'Independent timestamp, BSA Section 63 system certificate, and creator declaration (after you attest)',
  loginSub:
    'Admissibility-oriented evidence: TSA timestamp, BSA Section 63 system certificate, and Counsel Evidence Packet on every stamp',
  limitsLine: 'Generous limits for all creators · No credit card',
  counselPacketName: 'Counsel Evidence Packet',
  counselPacketFilenameSuffix: 'counsel-evidence-packet',
  downloadCounselPacketCta: 'Download Counsel Evidence Packet',
  monitoringLanding:
    'Theft alerts when TinEye or Google Vision is configured; always: in-app alerts and ProofStamp similarity scan',
};

const TSA_LABELS = {
  development: {
    tier: 'development',
    badge: 'TSA: Development witness (RFC 3161)',
    short: 'Independent RFC 3161 timestamp via configured TSA (development tier)',
    disclaimer:
      'Development-tier timestamps use the configured public TSA. For highest evidentiary weight in high-stakes disputes, your advocate may recommend a commercial timestamp authority.',
  },
  production: {
    tier: 'production',
    badge: 'TSA: Commercial witness',
    short: 'RFC 3161 timestamp from configured commercial authority',
    disclaimer: null,
  },
};

const SYSTEM_CERT_SCOPE =
  'This certificate describes the computer system that produced the electronic record under the Bharatiya Sakshya Adhiniyam, 2023. It does not certify authorship, copyright ownership, or litigation outcome.';

const CREATOR_DECLARATION_INTRO =
  'I, the undersigned creator, declare the following in connection with the electronic record identified below.';

/** @deprecated use SYSTEM_CERT_SCOPE */
const SYSTEM_65B_SCOPE = SYSTEM_CERT_SCOPE;

module.exports = {
  LEGAL_COPY_VERSION,
  BSA_FRAME,
  MARKETING,
  TSA_LABELS,
  SYSTEM_CERT_SCOPE,
  SYSTEM_65B_SCOPE,
  CREATOR_DECLARATION_INTRO,
};
