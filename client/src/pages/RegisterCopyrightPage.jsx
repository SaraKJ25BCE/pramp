import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import { ExternalLink, CheckCircle2 } from 'lucide-react';

export default function RegisterCopyrightPage() {
  return (
    <LegalLayout title="Copyright Office Registration (India)">
      <p>
        ProofStamp gives you <strong>instant evidence</strong> that a file existed in a given form at a
        registered time. Registering with the{' '}
        <a
          href="https://copyright.gov.in/"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 hover:underline"
        >
          Indian Copyright Office
        </a>{' '}
        can strengthen your position — especially Section 48 prima facie presumption of ownership for
        registered works.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-6">
        <p className="text-amber-900 text-sm">
          <strong>Important:</strong> ProofStamp evidence and Copyright Office registration work together.
          They are not substitutes for each other.
        </p>
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">When to register</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Commercial work you license or sell</li>
        <li>Work likely to be widely infringed</li>
        <li>Disputes where you may need statutory remedies in court</li>
      </ul>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">Checklist before you apply</h2>
      <ul className="space-y-3">
        {[
          'Stamp the final work on ProofStamp (download Counsel Evidence Packet after attestation)',
          'Keep original source files (PSD, AI, project files) offline',
          'Note creation dates and drafts (use ProofStamp version timeline if applicable)',
          'Prepare fee payment per current Copyright Office schedule',
          'Attach ProofStamp SHA-256 hash and certificate PDF as supporting exhibits if your advocate recommends',
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <h2 className="text-lg font-semibold text-gray-900 mt-6">Official e-filing</h2>
      <p>
        <a
          href="https://copyright.gov.in/UserRegistration/frmLoginPage.aspx"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
        >
          Copyright Office portal <ExternalLink className="h-4 w-4" />
        </a>
      </p>

      <p className="mt-6">
        <Link to="/legal-guide" className="text-indigo-600 hover:underline">Back to Legal Guide</Link>
      </p>
    </LegalLayout>
  );
}
