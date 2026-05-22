import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p><strong>Last updated:</strong> {new Date().toLocaleDateString('en-IN')}</p>
      <p>
        ProofStamp provides software to help creators document when digital files existed,
        bind them to cryptographic fingerprints, and export evidence packages. ProofStamp is
        <strong> not a law firm</strong> and does not provide legal advice.
      </p>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Service description</h2>
      <p>
        The service may include SHA-256 hashing, RSA signatures, RFC 3161 timestamps from third-party
        authorities, BSA 2023 Section 63 system certificates (colloquially “65B-style”) for Indian electronic evidence workflows,
        optional image watermarking, theft monitoring (when configured), and DMCA letter templates.
      </p>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">No guarantee of outcome</h2>
      <p>
        Evidence packages are technical artifacts. Courts, platforms, and opposing parties make
        their own decisions. We do not guarantee admissibility, takedown success, or ownership
        disputes resolved in your favor.
      </p>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Your responsibilities</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>You represent that you have rights to the files you upload.</li>
        <li>DMCA notices must be filed in good faith; false claims may create liability under applicable law.</li>
        <li>You are responsible for securing exported private keys if you use key export.</li>
      </ul>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, ProofStamp is not liable for indirect, incidental,
        or consequential damages arising from use of the service. Our total liability is limited
        to fees paid in the preceding twelve months, or zero if the service is provided without charge.
      </p>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Contact</h2>
      <p>Questions: support@proofstamp.io</p>
    </LegalLayout>
  );
}
