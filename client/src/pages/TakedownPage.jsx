import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileWarning, Send, Copy, CheckCircle2, Clock, XCircle,
  Loader2, ExternalLink, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileWarning },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700', icon: Send },
  acknowledged: { label: 'Acknowledged', color: 'bg-amber-100 text-amber-700', icon: Clock },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function TakedownPage() {
  const [searchParams] = useSearchParams();
  const [takedowns, setTakedowns] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stamps, setStamps] = useState([]);
  const [platforms, setPlatforms] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState('');

  // Form state
  const [formStampId, setFormStampId] = useState(searchParams.get('stampId') || '');
  const [formUrl, setFormUrl] = useState(searchParams.get('url') || '');
  const [formPlatform, setFormPlatform] = useState('');
  const [formAlertId] = useState(searchParams.get('alertId') || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
    if (searchParams.get('stampId')) setShowForm(true);
  }, []);

  async function loadData() {
    try {
      const [tdRes, stampRes, platRes] = await Promise.all([
        api.get('/takedowns'),
        api.get('/passport/me'),
        api.get('/takedowns/platforms'),
      ]);
      setTakedowns(tdRes.data.takedowns);
      setStats(tdRes.data.stats);
      setStamps(stampRes.data.passport.stamps || []);
      setPlatforms(platRes.data.platforms);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formStampId || !formUrl || !formPlatform) return;
    setSubmitting(true);
    try {
      const res = await api.post('/takedowns', {
        stampId: formStampId,
        infringingUrl: formUrl,
        platform: formPlatform,
        alertId: formAlertId || undefined,
      });
      setTakedowns(prev => [res.data.takedown, ...prev]);
      setExpanded(res.data.takedown.id);
      setShowForm(false);
      setFormStampId('');
      setFormUrl('');
      setFormPlatform('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create takedown');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(takedownId, status) {
    try {
      await api.patch(`/takedowns/${takedownId}/status`, { status });
      setTakedowns(prev => prev.map(t => t.id === takedownId ? { ...t, status } : t));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    }
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  }

  function detectPlatform(url) {
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('pinterest.com')) return 'pinterest';
    if (url.includes('facebook.com')) return 'facebook';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('behance.net')) return 'behance';
    if (url.includes('deviantart.com')) return 'deviantart';
    return 'other';
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <FileWarning className="h-8 w-8 text-red-600" />
              Takedown Center
            </h1>
            <p className="text-muted-foreground mt-1">
              File DMCA takedowns with one click. Track until content is removed.
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <FileWarning className="h-4 w-4 mr-2" />
            New Takedown
          </Button>
        </div>

        {/* Stats */}
        {stats && stats.total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <Card><CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.sent}</div>
              <p className="text-xs text-muted-foreground">Sent</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
              <p className="text-xs text-muted-foreground">Drafts</p>
            </CardContent></Card>
          </div>
        )}

        {/* New Takedown Form */}
        {showForm && (
          <Card className="border-red-200 bg-red-50/30">
            <CardHeader>
              <CardTitle className="text-lg">File a DMCA Takedown</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Your Stamp (the original work)</label>
                  <select
                    value={formStampId}
                    onChange={(e) => setFormStampId(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select your stamped work...</option>
                    {stamps.map(s => (
                      <option key={s.id} value={s.id}>{s.title} ({s.id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">URL of the stolen/infringing content</label>
                  <Input
                    placeholder="https://instagram.com/p/..."
                    value={formUrl}
                    onChange={(e) => {
                      setFormUrl(e.target.value);
                      if (!formPlatform) setFormPlatform(detectPlatform(e.target.value));
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Platform</label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select platform...</option>
                    {Object.entries(platforms).map(([key, info]) => (
                      <option key={key} value={key}>{info.name}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileWarning className="h-4 w-4 mr-2" />}
                  Generate DMCA Takedown Notice
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Takedown List */}
        <div className="space-y-3">
          {takedowns.length === 0 && !showForm ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">No takedowns filed</h3>
                <p className="text-muted-foreground mb-4">
                  When someone steals your work, file a takedown here to get it removed
                </p>
                <Button onClick={() => setShowForm(true)}>
                  <FileWarning className="h-4 w-4 mr-2" /> File a Takedown
                </Button>
              </CardContent>
            </Card>
          ) : (
            takedowns.map(td => {
              const statusConf = STATUS_CONFIG[td.status];
              const StatusIcon = statusConf?.icon || FileWarning;
              const isExpanded = expanded === td.id;

              return (
                <Card key={td.id}>
                  <CardContent className="p-4">
                    <div
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : td.id)}
                    >
                      <div className="h-12 w-12 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                        <StatusIcon className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{td.stamp?.title}</p>
                          <Badge className={statusConf?.color}>{statusConf?.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{td.infringingUrl}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {td.platform} · {new Date(td.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-4">
                        {/* DMCA Letter */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium">DMCA Notice (ready to send)</p>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => copyText(td.dmcaLetter, td.id)}
                            >
                              {copied === td.id ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                              <span className="ml-1">{copied === td.id ? 'Copied!' : 'Copy'}</span>
                            </Button>
                          </div>
                          <pre className="text-xs bg-gray-900 text-gray-300 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {td.dmcaLetter}
                          </pre>
                        </div>

                        {/* Platform link */}
                        {platforms[td.platform]?.reportUrl && (
                          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-blue-900">
                                File on {platforms[td.platform]?.name}
                              </p>
                              <p className="text-xs text-blue-700">
                                Method: {platforms[td.platform]?.method}
                              </p>
                            </div>
                            <Button size="sm" asChild>
                              <a href={platforms[td.platform].reportUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4 mr-1" /> Open Form
                              </a>
                            </Button>
                          </div>
                        )}

                        {/* Status actions */}
                        <div className="flex gap-2 flex-wrap">
                          {td.status === 'draft' && (
                            <Button size="sm" onClick={() => updateStatus(td.id, 'sent')}>
                              <Send className="h-4 w-4 mr-1" /> Mark as Sent
                            </Button>
                          )}
                          {td.status === 'sent' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => updateStatus(td.id, 'acknowledged')}>
                                Platform Acknowledged
                              </Button>
                              <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus(td.id, 'resolved')}>
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Content Removed
                              </Button>
                            </>
                          )}
                          {td.status === 'acknowledged' && (
                            <>
                              <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus(td.id, 'resolved')}>
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Content Removed
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => updateStatus(td.id, 'rejected')}>
                                <XCircle className="h-4 w-4 mr-1" /> Rejected
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
