import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield, CheckCircle2, Calendar, Lock, ExternalLink,
  Copy, Loader2, AlertTriangle, Fingerprint, GitBranch, Upload
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function SharePage() {
  const { stampId } = useParams();
  const { user } = useAuth();
  const [stamp, setStamp] = useState(null);
  const [passport, setPassport] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [showVersionUpload, setShowVersionUpload] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [versionFile, setVersionFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadStamp();
  }, [stampId]);

  async function loadStamp() {
    try {
      const [stampRes, versionsRes] = await Promise.all([
        api.get(`/stamps/${stampId}`),
        api.get(`/versions/${stampId}`).catch(() => ({ data: { versions: [] } })),
      ]);
      setStamp(stampRes.data.stamp);
      setPassport(stampRes.data.passport);
      setVersions(versionsRes.data.versions || []);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Stamp not found' : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  async function uploadVersion(e) {
    e.preventDefault();
    if (!versionFile || !versionLabel) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', versionFile);
      formData.append('label', versionLabel);
      formData.append('note', versionNote);
      await api.post(`/versions/${stampId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      setShowVersionUpload(false);
      setVersionLabel('');
      setVersionNote('');
      setVersionFile(null);
      loadStamp();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to upload version');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">{error}</h1>
          <Button className="mt-6" asChild><Link to="/">Go Home</Link></Button>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/p/${stamp.id}`;
  const isOwner = user && stamp && passport;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-600" />
            <span className="font-bold text-lg">ProofStamp</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/verify?id=${stamp.id}`}>
                <Fingerprint className="h-4 w-4 mr-1" /> Verify
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Image display */}
          {stamp.category === 'image' && (stamp.originalFileUrl || stamp.stampedFileUrl) && (
            <div className="relative bg-gray-900 flex items-center justify-center min-h-[300px] max-h-[500px]">
              <img
                src={stamp.stampedFileUrl || stamp.originalFileUrl}
                alt={stamp.title}
                className="max-w-full max-h-[500px] object-contain"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16">
                <div className="flex items-end justify-between">
                  <div className="flex items-center gap-3">
                    {passport?.user?.avatarUrl && (
                      <img src={passport.user.avatarUrl} alt="" className="h-10 w-10 rounded-full border-2 border-white/30" />
                    )}
                    <div>
                      <p className="text-white font-semibold">{passport?.displayName}</p>
                      <p className="text-white/70 text-sm">@{passport?.username}</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500/20 text-green-300 border-green-500/30 backdrop-blur-sm">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Verified Owner
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{stamp.title}</h1>
                {stamp.description && <p className="text-gray-600 mt-1">{stamp.description}</p>}
              </div>
              <Badge variant="outline" className="font-mono text-xs shrink-0">{stamp.id}</Badge>
            </div>

            {/* Creator info */}
            <div className="mt-6 flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
              {passport?.user?.avatarUrl && (
                <img src={passport.user.avatarUrl} alt="" className="h-12 w-12 rounded-full" />
              )}
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{passport?.displayName}</p>
                <Link to={`/u/${passport?.username}`} className="text-sm text-indigo-600 hover:underline">
                  @{passport?.username}
                </Link>
              </div>
              <div className="text-right text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(stamp.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
                <p className="capitalize mt-0.5">{stamp.license}</p>
              </div>
            </div>

            {/* Protection info */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Category', value: stamp.category },
                { label: 'Format', value: stamp.fileType?.toUpperCase() },
                { label: 'Protection', value: 'Multi-layer' },
                { label: 'AI Training', value: stamp.aiOptOut ? 'Prohibited' : 'Allowed', color: stamp.aiOptOut ? 'text-red-600' : 'text-green-600' },
              ].map((item) => (
                <div key={item.label} className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{item.label}</p>
                  <p className={`font-semibold capitalize mt-0.5 ${item.color || 'text-gray-900'}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* AI Opt-Out Notice */}
            {stamp.aiOptOut && (
              <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl">
                <p className="font-medium text-red-800 text-sm">AI Training Prohibited</p>
                <p className="text-red-600 text-xs mt-0.5">
                  This work is registered in the ProofStamp AI Opt-Out Registry.
                  Use for AI/ML training without explicit permission is prohibited.
                </p>
                <Link to="/registry" className="text-xs text-red-700 underline mt-1 inline-block">View Registry</Link>
              </div>
            )}

            {/* Creation Timeline (Proof of Process) */}
            {versions.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <GitBranch className="h-4 w-4 text-indigo-600" />
                  Creation Timeline ({versions.length} versions)
                </h3>
                <div className="relative pl-6 space-y-4">
                  <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-indigo-100" />
                  {versions.map((v, i) => (
                    <div key={v.id} className="relative">
                      <div className={`absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 ${
                        i === versions.length - 1 ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-indigo-300'
                      }`} />
                      <div className="flex items-center gap-3">
                        {v.thumbnailUrl && (
                          <img src={v.thumbnailUrl} alt="" className="h-10 w-10 rounded object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">v{v.version}: {v.label}</p>
                          {v.note && <p className="text-xs text-gray-500">{v.note}</p>}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => {
                  window.open(`${import.meta.env.VITE_API_URL}/versions/${stamp.id}/proof`, '_blank');
                }}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Export Creation Proof (JSON)
                </Button>
              </div>
            )}

            {/* Owner: Add Version */}
            {isOwner && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                {!showVersionUpload ? (
                  <Button variant="outline" size="sm" onClick={() => setShowVersionUpload(true)}>
                    <Upload className="h-4 w-4 mr-1.5" /> Add Version to Creation Timeline
                  </Button>
                ) : (
                  <form onSubmit={uploadVersion} className="space-y-3 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium">Add a version (sketch, draft, revision...)</p>
                    <input
                      type="text"
                      placeholder="Label (e.g. 'Initial Sketch', 'Color Pass')"
                      value={versionLabel}
                      onChange={(e) => setVersionLabel(e.target.value)}
                      className="flex h-9 w-full rounded-md border px-3 text-sm"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      value={versionNote}
                      onChange={(e) => setVersionNote(e.target.value)}
                      className="flex h-9 w-full rounded-md border px-3 text-sm"
                    />
                    <input
                      type="file"
                      onChange={(e) => setVersionFile(e.target.files[0])}
                      className="text-sm"
                      required
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={uploading}>
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                        Upload Version
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowVersionUpload(false)}>Cancel</Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(shareUrl, 'link')}>
                <Copy className="h-4 w-4 mr-1.5" />
                {copied === 'link' ? 'Copied!' : 'Copy Link'}
              </Button>
              {stamp.certificateUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={stamp.certificateUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1.5" /> Certificate PDF
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to={`/verify?id=${stamp.id}`}>
                  <Shield className="h-4 w-4 mr-1.5" /> Full Verification
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-gray-500">
          <p>
            Protected with <Shield className="h-3.5 w-3.5 inline text-indigo-500" />{' '}
            <Link to="/" className="text-indigo-600 hover:underline font-medium">ProofStamp</Link>
            {' '}— Cryptographic proof of creative ownership
          </p>
        </div>
      </div>
    </div>
  );
}
