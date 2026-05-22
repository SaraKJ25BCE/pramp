import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p><strong>Last updated:</strong> {new Date().toLocaleDateString('en-IN')}</p>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Data we collect</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Google account: email, name, avatar (via OAuth)</li>
        <li>Uploaded creative files and derived fingerprints (hashes, perceptual hashes, watermarked copies)</li>
        <li>Stamp metadata: titles, licenses, timestamps, signatures</li>
        <li>Audit logs: actions such as stamp creation, proof pack downloads, key export (IP address when available)</li>
        <li>Monitoring alerts and takedown records you create</li>
      </ul>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Storage & processors</h2>
      <p>
        Files may be stored on Cloudinary or local disk during processing. Database records are held in
        PostgreSQL. Trusted timestamp requests send only a SHA-256 hash to the configured TSA (e.g. FreeTSA).
        Reverse image search, when enabled, sends image URLs or buffers to TinEye or Google Vision per your configuration.
      </p>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Retention</h2>
      <p>
        Stamps and audit logs are retained while your account is active. Audit logs default to approximately
        one year unless otherwise configured. You may delete individual stamps from your dashboard.
      </p>
      <h2 className="text-lg font-semibold text-gray-900 mt-6">Your rights</h2>
      <p>
        You may request export of your proof bundles and account data. Contact support@proofstamp.io for
        deletion requests subject to legal retention requirements.
      </p>
    </LegalLayout>
  );
}
