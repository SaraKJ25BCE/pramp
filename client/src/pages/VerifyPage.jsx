import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import LegalEvidenceSummary from '@/components/LegalEvidenceSummary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload, CheckCircle2, AlertTriangle, HelpCircle, Loader2,
  Calendar, Shield, ExternalLink, FileCheck, Lock, Fingerprint
} from 'lucide-react';

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('upload');
  const [stampIdInput, setStampIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setStampIdInput(id);
      setActiveTab('link');
      verifyByStampId(id);
    }
  }, [searchParams]);

  async function verifyByFile(file) {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/verify/file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function verifyByStampId(id) {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const stampId = (id || stampIdInput || '').trim();
      const match = stampId.match(/PS-\d{4}-[A-Z0-9]{5}/);
      const cleanId = match ? match[0] : null;
      if (!cleanId) {
        setError('Invalid stamp ID format. Expected PS-YYYY-XXXXX (e.g. PS-2026-A1B2C)');
        setLoading(false);
        return;
      }
      const res = await api.get(`/verify/${cleanId}`);
      setResult(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setResult({ outcome: 'C', message: 'No ProofStamp found', stamp: null, passport: null });
      } else {
        setError(err.response?.data?.error || 'Verification failed');
      }
    } finally {
      setLoading(false);
    }
  }

  const onDrop = useCallback(async (acceptedFiles) => {
    const f = acceptedFiles[0];
    if (f) verifyByFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024,
  });

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Verify Ownership</h1>
          <p className="text-muted-foreground mt-1">
            Check if any digital file is registered and protected with ProofStamp
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === 'upload' ? 'default' : 'outline'}
            onClick={() => { setActiveTab('upload'); setResult(null); setError(''); }}
          >
            <FileCheck className="h-4 w-4 mr-2" />
            Upload File
          </Button>
          <Button
            variant={activeTab === 'link' ? 'default' : 'outline'}
            onClick={() => { setActiveTab('link'); setResult(null); setError(''); }}
          >
            <Fingerprint className="h-4 w-4 mr-2" />
            Stamp ID
          </Button>
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && !result && (
          <Card>
            <CardContent className="p-6">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                {loading ? (
                  <div className="space-y-3">
                    <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
                    <p className="font-medium">Analyzing file...</p>
                    <p className="text-sm text-muted-foreground">Checking fingerprint, perceptual hash, and watermark</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="font-medium">Drop any file to verify</p>
                      <p className="text-sm text-muted-foreground">
                        Any format — images, audio, video, code, documents
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Link Tab */}
        {activeTab === 'link' && !result && (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={(e) => { e.preventDefault(); verifyByStampId(); }} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Stamp ID or Verification URL</label>
                  <Input
                    placeholder="PS-2026-XXXXX or paste the full URL"
                    value={stampIdInput}
                    onChange={(e) => setStampIdInput(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={!stampIdInput || loading}>
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                  Verify
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {result && <VerificationResult result={result} onReset={() => { setResult(null); setError(''); }} />}
      </div>
    </Layout>
  );
}

function VerificationResult({ result, onReset }) {
  const { outcome, stamp, passport, confidence } = result;

  const config = {
    A: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50 border-green-200',
      badge: 'success',
      title: 'Verified & Protected',
      subtitle: result.message || 'This file is registered and owned',
    },
    B: {
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50 border-red-200',
      badge: 'destructive',
      title: 'Tampered',
      subtitle: 'This file has been modified since registration',
    },
    C: {
      icon: HelpCircle,
      color: 'text-gray-500',
      bg: 'bg-gray-50 border-gray-200',
      badge: 'secondary',
      title: 'Not Registered',
      subtitle: 'No ProofStamp found on this file',
    },
  };

  const c = config[outcome];
  const Icon = c.icon;

  return (
    <Card className={`mt-6 ${c.bg}`}>
      <CardContent className="p-8">
        <div className="text-center mb-6">
          <div className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${outcome === 'A' ? 'bg-green-100' : outcome === 'B' ? 'bg-red-100' : 'bg-gray-100'} mb-4`}>
            <Icon className={`h-8 w-8 ${c.color}`} />
          </div>
          <h2 className="text-2xl font-bold">{c.title}</h2>
          <p className="text-muted-foreground">{c.subtitle}</p>
          {confidence && outcome === 'A' && (
            <Badge variant="success" className="mt-2">
              <Lock className="h-3 w-3 mr-1" />
              {confidence === 'exact' ? 'Exact match' : confidence === 'high' ? 'High confidence' : confidence === 'watermark' ? 'Watermark verified' : 'Content match'}
            </Badge>
          )}
        </div>

        {stamp && passport && (
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b">
              {passport.user?.avatarUrl && (
                <img src={passport.user.avatarUrl} alt="" className="h-10 w-10 rounded-full" />
              )}
              <div>
                <p className="font-medium">{passport.displayName}</p>
                <Link to={`/u/${passport.username}`} className="text-sm text-primary hover:underline">
                  @{passport.username}
                </Link>
              </div>
              <Badge variant={c.badge} className="ml-auto">
                {outcome === 'A' ? 'Owner Verified' : 'Tampered'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Title</span>
                <p className="font-medium">{stamp.title}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Stamp ID</span>
                <p className="font-medium">{stamp.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Category</span>
                <p className="font-medium capitalize">{stamp.category}</p>
              </div>
              <div>
                <span className="text-muted-foreground">File Type</span>
                <p className="font-medium">{stamp.fileType?.toUpperCase()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">License</span>
                <p className="font-medium">{stamp.license}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Registered On</span>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(stamp.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {outcome === 'A' && result.verification && (
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-sm space-y-2">
                <p className="font-medium text-indigo-900">Legal evidence layers</p>
                <div className="text-indigo-800">
                  <LegalEvidenceSummary stamp={stamp} verification={result.verification} />
                </div>
                <p className="text-xs">RSA signature: {result.verification.signatureValid ? 'valid' : 'invalid'}</p>
                {result.verification.legalArtifactsUrl && (
                  <a
                    href={result.verification.legalArtifactsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Shield className="h-3 w-3" /> View evidence catalog
                  </a>
                )}
                <p className="text-xs text-muted-foreground">
                  Technical verification only — not a legal ruling.{' '}
                  <Link to="/legal-guide" className="text-indigo-600 hover:underline">Learn more</Link>
                </p>
              </div>
            )}

            {stamp.license?.includes('AI') && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <p className="text-sm font-medium text-red-800">AI Training Prohibited</p>
                <p className="text-xs text-red-600">
                  The creator has explicitly prohibited use of this work for AI/ML training.
                </p>
              </div>
            )}

            {result.c2pa && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm space-y-2">
                <p className="font-medium text-slate-900 flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-slate-700" /> C2PA Content Provenance
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Generator</span>
                    <span className="font-medium">{result.c2pa.claim_generator || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Origin Assertion</span>
                    <span className="font-medium text-emerald-700 font-semibold">
                      {result.c2pa.assertions?.find(a => a.label === 'proofstamp.provenance')?.data?.origin || 'Human Created'}
                    </span>
                  </div>
                  {result.c2pa.assertions?.find(a => a.label === 'c2pa.training-mining') && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground block">AI Training</span>
                      <span className="font-medium text-red-600">Opt-out Enforced (Do Not Train)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {outcome === 'A' && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm">
                <p className="font-medium text-amber-900 flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-amber-700" /> Indian IT Rules 2021 Readiness
                </p>
                <p className="text-amber-800 text-xs leading-relaxed">
                  This cryptographic proof satisfies Section 63 of the BSA 2023. It can be used to issue a mandatory 24-hour deepfake takedown under Rule 3(2)(b) or a 72-hour copyright takedown under Rule 3(1)(b).
                </p>
              </div>
            )}

            <div className="pt-3 border-t flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/p/${stamp.id}`}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Share Page
                </Link>
              </Button>
              {stamp.certificateUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={stamp.certificateUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Certificate
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => {
                window.open(`${import.meta.env.VITE_API_URL}/stamps/${stamp.id}/proof`, '_blank');
              }}>
                <Shield className="h-4 w-4 mr-1" /> Proof Bundle (JSON)
              </Button>
            </div>
          </div>
        )}

        {outcome === 'C' && (
          <div className="text-center mt-4">
            <Button asChild>
              <Link to="/stamp">
                <Shield className="h-4 w-4 mr-2" />
                Protect This File
              </Link>
            </Button>
          </div>
        )}

        <div className="text-center mt-6">
          <Button variant="ghost" onClick={onReset}>Verify Another File</Button>
        </div>
      </CardContent>
    </Card>
  );
}
