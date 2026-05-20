import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FileImage, Loader2, CheckCircle2, Copy, Download, ExternalLink,
  File, Music, Video, Code, Package, Type
} from 'lucide-react';

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
  const [mode, setMode] = useState('single'); // 'single' or 'bulk'

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
      setError(err.response?.data?.error || 'Failed to stamp file(s)');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
  }

  async function forceDownload(url, filename) {
    const response = await fetch(url);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
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
  }

  // Success state — single file
  if (result) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto">
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-8 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">File Protected!</h2>
              <p className="text-muted-foreground mb-6">
                Your work is now cryptographically registered and protected
              </p>

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
                  <span className="text-sm text-muted-foreground">Protection Layers</span>
                  <span className="text-sm">
                    {result.stamp.category === 'image' ? '5 layers' : '3 layers'}
                  </span>
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

              <div className="flex gap-3 justify-center flex-wrap">
                <Button asChild>
                  <a href={`/p/${result.stamp.id}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" /> View Share Page
                  </a>
                </Button>
                {result.stamp.stampedFileUrl && (
                  <Button variant="outline" onClick={() => forceDownload(result.stamp.stampedFileUrl, `${result.stamp.id}-stamped.png`)}>
                    <Download className="h-4 w-4 mr-2" /> Stamped File
                  </Button>
                )}
                {result.stamp.certificateUrl && (
                  <Button variant="outline" onClick={() => forceDownload(result.stamp.certificateUrl, `${result.stamp.id}-certificate.pdf`)}>
                    <Download className="h-4 w-4 mr-2" /> Certificate
                  </Button>
                )}
                <Button variant="outline" onClick={() => {
                  const url = `${import.meta.env.VITE_API_URL}/stamps/${result.stamp.id}/proof`;
                  window.open(url, '_blank');
                }}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Proof Bundle
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
