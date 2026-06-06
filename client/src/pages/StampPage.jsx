import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FileImage, Loader2, CheckCircle2, Copy, Download, ExternalLink,
  File, Music, Video, Code, Package, Type, Scale, Radar
} from 'lucide-react';
import { MARKETING, TSA_BADGES, BSA_FRAME } from '@/content/legalCopy';
import { CREATOR_ATTESTATION_STATEMENT } from '@/content/legalCopy';
import { downloadCounselPacket, attestCreator } from '@/lib/legalProof';
import { downloadStampedFile, hasStampedFile } from '@/lib/stampFiles';
import { useToast } from '@/components/ui/toast';

async function computeSHA256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const LICENSE_OPTIONS = [
  { value: 'All Rights Reserved', label: 'All Rights Reserved — No one can use without permission' },
  { value: 'CC BY', label: 'CC BY — Others can use with credit' },
  { value: 'CC BY-SA', label: 'CC BY-SA — Use with credit, share alike' },
  { value: 'CC BY-NC', label: 'CC BY-NC — Non-commercial use with credit' },
  { value: 'CC BY-NC-ND', label: 'CC BY-NC-ND — No derivatives, non-commercial' },
  { value: 'No AI Training', label: 'No AI/ML Training — Prohibit AI training use' },
  { value: 'Public Domain', label: 'Public Domain — Free for any use' },
];

function getCategoryIcon(category) {
  switch (category) {
    case 'image': return FileImage;
    case 'audio': return Music;
    case 'video': return Video;
    case 'code': return Code;
    case 'archive': return Package;
    case 'font': return Type;
    default: return File;
  }
}

function getFileCategory(type, name) {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('text/') || type.includes('javascript') || type.includes('json')) return 'code';
  if (type === 'application/pdf') return 'document';
  if (type.includes('zip') || type.includes('tar')) return 'archive';
  if (type.startsWith('font/')) return 'font';
  const ext = name?.split('.').pop()?.toLowerCase();
  if (['py', 'js', 'ts', 'jsx', 'tsx', 'go', 'rs', 'c', 'cpp', 'java', 'rb'].includes(ext)) return 'code';
  if (['psd', 'ai', 'sketch', 'fig', 'xd'].includes(ext)) return 'design';
  return 'other';
}

export default function StampPage() {
  const { toast } = useToast();
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [hash, setHash] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [license, setLicense] = useState('All Rights Reserved');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('single');
  const [polledStamp, setPolledStamp] = useState(null);
  const [legalReady, setLegalReady] = useState(false);
  const [showMonitorPrompt, setShowMonitorPrompt] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [attestName, setAttestName] = useState('');
  const [attestCity, setAttestCity] = useState('');
  const [attestCountry, setAttestCountry] = useState('');
  const [attestConfirm, setAttestConfirm] = useState(false);
  const [statementConfirm, setStatementConfirm] = useState(false);
  const [attestLoading, setAttestLoading] = useState(false);
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    if (!result?.stamp?.id) return undefined;
    setShowMonitorPrompt(result.stamp.category === 'image');
    let cancelled = false;
    let polls = 0;
    const maxPolls = 40;

    const poll = async () => {
      if (cancelled || polls >= maxPolls) return;
      polls += 1;
      try {
        const res = await api.get(`/stamps/${result.stamp.id}`);
        if (cancelled) return;
        const s = res.data.stamp;
        setPolledStamp(s);
        if (s.creatorAttestationAt) setAttested(true);
        const cdnReady = s.cdnReady || (!s.processing && /cloudinary/i.test(s.originalFileUrl || ''));
        if (cdnReady && s.tsaVerifyStatus === 'valid' && s.evidenceCertificateUrl) {
          setLegalReady(true);
        }
      } catch (err) {
        if (err.response?.status === 429) return;
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [result?.stamp?.id]);

  async function enableMonitoring() {
    if (!result?.stamp?.id) return;
    setMonitorLoading(true);
    try {
      await api.post(`/monitor/enable/${result.stamp.id}`);
      setShowMonitorPrompt(false);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to enable monitoring', 'error');
    } finally {
      setMonitorLoading(false);
    }
  }

  const onDrop = useCallback(async (acceptedFiles) => {
    if (mode === 'bulk') {
      setFiles(acceptedFiles);
      setError('');
      setBulkResults(null);
      return;
    }

    const f = acceptedFiles[0];
    if (!f) return;

    setFiles([f]);
    setError('');
    setResult(null);

    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }

    const fileHash = await computeSHA256(f);
    setHash(fileHash);
  }, [mode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: mode === 'bulk' ? 20 : 1,
    maxSize: 100 * 1024 * 1024,
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'bulk') {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('license', license);
        formData.append('titles', JSON.stringify(files.map(f => f.name)));

        const res = await api.post('/stamps/bulk', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        });
        setBulkResults(res.data);
      } else {
        if (!files[0] || !title) return;
        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('license', license);
        formData.append('clientHash', hash);

        const res = await api.post('/stamps', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        });
        setResult(res.data);
      }
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data) {
        let msg = data.error || 'This file is already registered';
        if (data.registeredBy) msg += ` (${data.registeredBy})`;
        if (data.existingStampId) msg += ` — Stamp ID: ${data.existingStampId}`;
        setError(msg);
      } else {
        setError(data?.error || 'Failed to stamp file(s)');
      }
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
  }

  function reset() {
    setResult(null);
    setBulkResults(null);
    setFiles([]);
    setPreview(null);
    setTitle('');
    setDescription('');
    setHash('');
    setError('');
    setPolledStamp(null);
    setLegalReady(false);
    setShowMonitorPrompt(false);
    setAttestName('');
    setAttestConfirm(false);
    setAttested(false);
  }

  async function submitAttestation() {
    if (!result?.stamp?.id || !attestConfirm || !attestName.trim()) return;
    setAttestLoading(true);
    try {
      await attestCreator(result.stamp.id, {
        fullName: attestName.trim(),
        city: attestCity.trim(),
        country: attestCountry.trim(),
      });
      setAttested(true);
      toast('Declaration signed and cryptographically bound to your Passport key.', 'success');
      const res = await api.get(`/stamps/${result.stamp.id}`);
      setPolledStamp(res.data.stamp);
    } catch (e) {
      toast(e.message || 'Attestation failed', 'error');
    } finally {
      setAttestLoading(false);
    }
  }

  const displayStamp = polledStamp || result?.stamp;

  // Success state — single file
  if (result) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto">
          <Card className="border-green-200 bg-black-50/50">
            <CardContent className="p-8 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{MARKETING.stampSuccessTitle}</h2>
              <p className="text-muted-foreground mb-4">
                {TSA_BADGES[displayStamp?.tsaTier || 'development']} · {BSA_FRAME.colloquialLabel}{' '}
                {legalReady ? 'ready' : 'generating…'}
              </p>

              {showMonitorPrompt && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-4 text-left">
                  <p className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                    <Radar className="h-4 w-4" /> Enable theft monitoring?
                  </p>
                  <p className="text-xs text-indigo-700 mt-1 mb-3">
                    {MARKETING.monitoringLanding}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={enableMonitoring} disabled={monitorLoading}>
                      {monitorLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enable monitoring'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowMonitorPrompt(false)}>Later</Button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg border p-4 mb-6 text-left space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Stamp ID</span>
                  <Badge>{result.stamp.id}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Category</span>
                  <Badge variant="secondary">{result.stamp.category}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">CDN upload</span>
                  <Badge variant={displayStamp?.cdnReady || !displayStamp?.processing ? 'default' : 'secondary'}>
                    {displayStamp?.cdnReady || (!displayStamp?.processing && /cloudinary/i.test(displayStamp?.originalFileUrl || ''))
                      ? 'ready'
                      : 'processing…'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">TSA</span>
                  <Badge
                    variant={
                      displayStamp?.tsaVerifyStatus === 'valid' && displayStamp?.tsaStatus !== 'pending'
                        ? 'default'
                        : 'secondary'
                    }
                    className={displayStamp?.tsaStatus === 'pending' ? 'bg-amber-100 text-amber-900' : ''}
                  >
                    {displayStamp?.tsaStatus === 'pending'
                      ? 'pending (retrying)'
                      : displayStamp?.tsaVerifyStatus || 'pending'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{BSA_FRAME.section}</span>
                  <Badge variant={displayStamp?.evidenceCertificateUrl ? 'default' : 'secondary'}>
                    {displayStamp?.evidenceCertificateUrl ? 'ready' : 'generating'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Verification URL</span>
                  <button
                    onClick={() => copyToClipboard(result.verifyUrl)}
                    className="text-sm text-primary flex items-center gap-1 hover:underline"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <code className="block text-xs bg-gray-50 p-2 rounded break-all">{result.verifyUrl}</code>
              </div>

              {/* Share link */}
              <div className="bg-white rounded-lg border p-4 mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Share your protected work:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-50 p-2 rounded break-all">
                    {window.location.origin}/p/{result.stamp.id}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(`${window.location.origin}/p/${result.stamp.id}`)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {!attested && !displayStamp?.creatorAttestationAt && (
                <Card className="mb-6 text-left border-amber-200 bg-amber-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Creator declaration (required)</CardTitle>
                    <CardDescription>
                      Sign your authorship declaration before downloading the {MARKETING.counselPacketName}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground border rounded p-2 bg-white">
                      {CREATOR_ATTESTATION_STATEMENT}
                    </p>
                    <label className="flex items-start gap-3 text-sm leading-relaxed">
                      <input
                        type="checkbox"
                        checked={statementConfirm}
                        onChange={(e) => setStatementConfirm(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 accent-black"
                      />
                      <span className="text-zinc-700">
                        I have read and confirm the statement above
                        (type your name below — do not use autofill).
                      </span>
                    </label>

                    <label className="flex items-start gap-3 text-sm leading-relaxed">
                      <input
                        type="checkbox"
                        checked={attestConfirm}
                        onChange={(e) => setAttestConfirm(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 accent-black"
                      />
                      <span className="text-zinc-700">
                        I understand this binds my Passport RSA key
                        and is separate from the system certificate.
                      </span>
                    </label>
                    <Input placeholder="Full legal name (typed)" value={attestName} onChange={(e) => setAttestName(e.target.value)} autoComplete="off" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="City" value={attestCity} onChange={(e) => setAttestCity(e.target.value)} />
                      <Input placeholder="Country" value={attestCountry} onChange={(e) => setAttestCountry(e.target.value)} />
                    </div>
                    <Button
                      onClick={submitAttestation}
                      disabled={
                        !attestConfirm ||
                        !statementConfirm ||
                        !attestName.trim() ||
                        !attestCity.trim() ||
                        !attestCountry.trim() ||
                        attestLoading
                      }
                    >
                      {attestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign Declaration'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3 justify-center flex-wrap">
                <Button
                  className="bg-indigo-700 hover:bg-indigo-800"
                  disabled={!attested && !displayStamp?.creatorAttestationAt}
                  onClick={() =>
                    downloadCounselPacket(result.stamp.id).catch((e) => {
                      const msg = e.message || '';
                      if (msg.includes('REATTEST') || msg.includes('attestation')) {
                        toast('Re-attestation required: sign your declaration again to bind your RSA key.', 'warning');
                      } else {
                        toast(msg || 'Complete creator declaration first', 'error');
                      }
                    })
                  }
                >
                  <Scale className="h-4 w-4 mr-2" /> {MARKETING.downloadCounselPacketCta}
                </Button>
                <Button asChild variant="outline">
                  <a href={`/p/${result.stamp.id}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" /> Share Page
                  </a>
                </Button>
                {hasStampedFile(displayStamp || result.stamp) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadStampedFile(displayStamp || result.stamp).catch((e) =>
                        toast(e.message || 'Download failed', 'error')
                      )
                    }
                  >
                    <Download className="h-4 w-4 mr-2" /> Stamped file
                  </Button>
                )}
                {(displayStamp?.evidenceCertificateUrl || result.legalProof?.systemCertificateUrl) && (
                  <Button variant="outline" onClick={() => window.open(displayStamp?.evidenceCertificateUrl || result.legalProof.systemCertificateUrl, '_blank')}>
                    <Download className="h-4 w-4 mr-2" /> System cert
                  </Button>
                )}
                <Button variant="outline" onClick={() => window.open(`${import.meta.env.VITE_API_URL}/stamps/${result.stamp.id}/proof`, '_blank')}>
                  Proof Bundle (JSON)
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/legal-guide">What this proves</Link>
                </Button>
              </div>

              <div className="mt-6">
                <Button variant="ghost" onClick={reset}>Stamp Another File</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Success state — bulk
  if (bulkResults) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto">
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold">{bulkResults.count} Files Protected!</h2>
                <p className="text-muted-foreground">All files are now registered and protected</p>
              </div>

              <div className="space-y-2">
                {bulkResults.stamps.map((s) => {
                  const Icon = getCategoryIcon(s.category);
                  return (
                    <div key={s.stampId} className="flex items-center gap-3 bg-white rounded-lg border p-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1 truncate">{s.title}</span>
                      <Badge variant="secondary">{s.category}</Badge>
                      <Badge>{s.stampId}</Badge>
                    </div>
                  );
                })}
              </div>

              <div className="text-center mt-6">
                <Button variant="ghost" onClick={reset}>Stamp More Files</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Protect Your Work</h1>
          <p className="text-muted-foreground mt-1">
            Register any digital file — images, audio, video, code, documents, designs
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <Button variant={mode === 'single' ? 'default' : 'outline'} onClick={() => { setMode('single'); reset(); }}>
            Single File
          </Button>
          <Button variant={mode === 'bulk' ? 'default' : 'outline'} onClick={() => { setMode('bulk'); reset(); }}>
            Bulk Upload (up to 20)
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Drop Zone */}
          <Card>
            <CardContent className="p-6">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                {files.length > 0 ? (
                  <div className="space-y-4">
                    {preview && (
                      <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg shadow-sm" />
                    )}
                    {mode === 'bulk' ? (
                      <div className="space-y-1">
                        {files.map((f, i) => {
                          const Icon = getCategoryIcon(getFileCategory(f.type, f.name));
                          return (
                            <div key={i} className="flex items-center gap-2 justify-center text-sm">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="truncate max-w-[200px]">{f.name}</span>
                              <Badge variant="secondary">{(f.size / 1024).toFixed(0)} KB</Badge>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        {(() => { const Icon = getCategoryIcon(getFileCategory(files[0].type, files[0].name)); return <Icon className="h-4 w-4 text-muted-foreground" />; })()}
                        <span className="text-sm text-muted-foreground">{files[0]?.name}</span>
                        <Badge variant="secondary">{(files[0]?.size / 1024 / 1024).toFixed(2)} MB</Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="font-medium">
                        {mode === 'bulk' ? 'Drop multiple files here' : 'Drop any file here or click to browse'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Images, audio, video, PDFs, code, designs — any digital file up to 100MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {hash && mode === 'single' && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">File Fingerprint (SHA-256)</p>
                  <code className="text-xs break-all">{hash}</code>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Form Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Protection Details</CardTitle>
              <CardDescription>
                {mode === 'bulk'
                  ? 'These settings apply to all files'
                  : 'Describe your work and choose protection level'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mode === 'single' && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Title *</label>
                    <Input
                      placeholder="My Creative Work"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Description</label>
                    <Input
                      placeholder="Brief description of this work..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">License & Protection Level</label>
                <select
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {LICENSE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Protection summary */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm font-medium text-blue-900 mb-2">Protection layers applied:</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-blue-700">
                  <span>SHA-256 fingerprint</span>
                  <span>RSA digital signature</span>
                  <span>Timestamp proof</span>
                  <span>Certificate of authenticity</span>
                  {files[0]?.type?.startsWith('image/') && (
                    <>
                      <span>Perceptual hash (pHash)</span>
                      <span>DWT-DCT watermark</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={(mode === 'single' && (!files[0] || !title)) || (mode === 'bulk' && files.length === 0) || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Protecting {mode === 'bulk' ? `${files.length} files` : 'your file'}...
              </>
            ) : (
              mode === 'bulk' ? `Protect ${files.length || 0} Files` : 'Protect This File'
            )}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
