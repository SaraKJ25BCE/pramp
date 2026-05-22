import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import { MARKETING, TSA_BADGES, BSA_FRAME } from '@/content/legalCopy';

export default function LegalGuidePage() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  return (
    <LegalLayout title="India Admissibility Guide">
      <p>
        This guide explains what ProofStamp produces and what it does <strong>not</strong> replace.
        Always consult a qualified advocate for your specific dispute.
      </p>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">What ProofStamp provides</h2>
      <table className="w-full text-left border border-gray-200 rounded-lg overflow-hidden text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 font-semibold">Artifact</th>
            <th className="p-3 font-semibold">Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-3">SHA-256 fingerprint</td>
            <td className="p-3">Proves the file you registered matches a specific byte sequence</td>
          </tr>
          <tr className="border-t">
            <td className="p-3">RSA-2048 signature</td>
            <td className="p-3">Binds the stamp to your Passport identity at registration time</td>
          </tr>
          <tr className="border-t">
            <td className="p-3">RFC 3161 timestamp</td>
            <td className="p-3">Independent time witness from a Timestamp Authority (not ProofStamp&apos;s clock alone)</td>
          </tr>
          <tr className="border-t">
            <td className="p-3">{BSA_FRAME.shortLabel}</td>
            <td className="p-3">Describes the computer system output under {BSA_FRAME.act} — not authorship or ownership</td>
          </tr>
          <tr className="border-t">
            <td className="p-3">Creator declaration</td>
            <td className="p-3">Your attested statement of authorship/rights (separate from system certificate)</td>
          </tr>
          <tr className="border-t">
            <td className="p-3">{MARKETING.counselPacketName}</td>
            <td className="p-3">ZIP for your advocate: proof JSON, both PDFs, TSA token, affidavit template, FOR_YOUR_ADVOCATE.md</td>
          </tr>
        </tbody>
      </table>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">TSA tiers</h2>
      <table className="w-full text-left border border-gray-200 rounded-lg overflow-hidden text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 font-semibold">Mode</th>
            <th className="p-3 font-semibold">Badge</th>
            <th className="p-3 font-semibold">When to use</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="p-3">development (default)</td>
            <td className="p-3">{TSA_BADGES.development}</td>
            <td className="p-3">Configured public TSA (e.g. FreeTSA). Suitable for development and many pre-litigation workflows.</td>
          </tr>
          <tr className="border-t">
            <td className="p-3">production</td>
            <td className="p-3">{TSA_BADGES.production}</td>
            <td className="p-3">Commercial TSA URL with <code className="text-xs">TSA_MODE=production</code>. Your advocate may prefer this for high-stakes disputes.</td>
          </tr>
        </tbody>
      </table>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">What ProofStamp is not</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong>Not</strong> a replacement for Copyright Office registration (Section 48 prima facie in India)</li>
        <li><strong>Not</strong> a guarantee you will win in court or on social platforms</li>
        <li><strong>Not</strong> automatic removal of infringing content — you file notices yourself</li>
        <li><strong>Not</strong> legal advice</li>
      </ul>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">API: artifacts per stamp</h2>
      <p>
        For any public Stamp ID, see the catalog of claims and download URLs:
      </p>
      <code className="block bg-gray-100 p-3 rounded text-xs break-all">
        GET {apiUrl}/legal/PS-YYYY-XXXXX/artifacts
      </code>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">Recommended use</h2>
      <ol className="list-decimal pl-6 space-y-2">
        <li>Stamp work before you publish or share widely</li>
        <li>Complete creator declaration attestation on the stamp page</li>
        <li>Download the {MARKETING.counselPacketName} and store offline</li>
        <li>Enable monitoring for images you publish online ({MARKETING.monitoringLanding})</li>
        <li>When infringed, file DMCA with the packet attached</li>
        <li>
          For maximum ownership presumption in India, also consider{' '}
          <Link to="/register-copyright" className="text-indigo-600 hover:underline">Copyright Office registration</Link>
        </li>
      </ol>
    </LegalLayout>
  );
}
