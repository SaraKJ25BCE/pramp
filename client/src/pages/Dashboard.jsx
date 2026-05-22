import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Stamp, FileCheck, Plus, Calendar, Shield, FileImage, Music, Video,
  Code, File, Package, Type, Lock, Download, Trash2, AlertTriangle, Scale
} from 'lucide-react';
import { downloadCounselPacket, legalStatusBadges, MARKETING } from '@/lib/legalProof';
import { useToast } from '@/components/ui/toast';

function getCategoryIcon(category) {
  const map = { image: FileImage, audio: Music, video: Video, code: Code, archive: Package, font: Type, design: FileImage };
  return map[category] || File;
}

export default function Dashboard() {
  const { toast } = useToast();
  const { user, passport } = useAuth();
  const [stamps, setStamps] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [draftTakedowns, setDraftTakedowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [passportRes, alertRes, tdRes, usageRes] = await Promise.all([
        api.get('/passport/me'),
        api.get('/monitor/alerts').catch(() => ({ data: { alerts: [] } })),
        api.get('/takedowns').catch(() => ({ data: { takedowns: [] } })),
        api.get('/passport/me/usage').catch(() => ({ data: null })),
      ]);
      setStamps(passportRes.data.passport.stamps || []);
      setUsage(usageRes.data);
      setAlerts((alertRes.data.alerts || []).filter((a) => a.status === 'new'));
      setDraftTakedowns((tdRes.data.takedowns || []).filter((t) => t.status === 'draft'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(stampId, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this stamp? This cannot be undone.')) return;
    setDeleting(stampId);
    try {
      await api.delete(`/stamps/${stampId}`);
      setStamps((prev) => prev.filter((s) => s.id !== stampId));
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to delete', 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function handleDownload(stamp, e) {
    e.preventDefault();
    e.stopPropagation();
    const url = stamp.stampedFileUrl || stamp.originalFileUrl;
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${stamp.id}-${stamp.fileName || 'file'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      window.open(url, '_blank');
    }
  }

  const categories = stamps.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <div className="space-y-8">
        {/* Passport Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-0">
          <CardContent className="p-8">
            <div className="flex items-center gap-6">
              {user?.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="h-20 w-20 rounded-full ring-4 ring-white/20" />
              )}
              <div>
                <h1 className="text-2xl font-bold">{passport?.displayName}</h1>
                <p className="text-blue-100">@{passport?.username}</p>
                <p className="text-blue-200 text-sm mt-1">
                  Passport: {passport?.id}
                </p>
                <p className="text-blue-100/80 text-xs mt-2 max-w-md">
                  Your signing key is stored server-side (encrypted per account) for convenience. For maximum security, browser-side signing is on our roadmap.
                </p>
                {usage && typeof usage.stampsRemaining === 'number' && (
                  <p className="text-blue-100 text-sm mt-2">
                    {usage.stampsRemaining} stamps remaining this month
                    {usage.tsaCallsThisMonth != null ? ` · ${usage.tsaCallsThisMonth} TSA calls` : ''}
                  </p>
                )}
              </div>
              <div className="ml-auto text-right">
                <div className="text-4xl font-bold">{stamps.length}</div>
                <div className="text-blue-200 text-sm">Files Protected</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Row */}
        {stamps.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(categories).map(([cat, count]) => {
              const Icon = getCategoryIcon(cat);
              return (
                <Card key={cat}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground capitalize">{cat}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">100%</div>
                  <div className="text-xs text-muted-foreground">Protected</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {(alerts.length > 0 || draftTakedowns.length > 0) && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Needs action
              </h2>
              {alerts.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-sm text-muted-foreground">{alerts.length} new theft alert(s)</p>
                  {alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{alert.stamp?.title || alert.stampId}</p>
                        <a href={alert.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 truncate block max-w-md">
                          {alert.sourceUrl}
                        </a>
                      </div>
                      <Button size="sm" asChild>
                        <Link to={`/takedowns?stampId=${alert.stampId}&url=${encodeURIComponent(alert.sourceUrl)}&alertId=${alert.id}`}>
                          File takedown
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {draftTakedowns.length > 0 && (
                <p className="text-sm">
                  {draftTakedowns.length} draft takedown(s) —{' '}
                  <Link to="/takedowns" className="text-indigo-600 hover:underline">continue filing</Link>
                </p>
              )}
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link to="/monitor">View all alerts</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-4 flex-wrap">
          <Button asChild size="lg">
            <Link to="/stamp">
              <Plus className="h-4 w-4 mr-2" />
              Protect a File
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link to="/verify">
              <FileCheck className="h-4 w-4 mr-2" />
              Verify Ownership
            </Link>
          </Button>
        </div>

        {/* Protected Files */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Protected Files</h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-40 bg-gray-200 rounded-lg mb-3" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : stamps.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium">No files protected yet</p>
                <p className="text-muted-foreground mb-4">
                  Start safeguarding your creative work — any digital file
                </p>
                <Button asChild>
                  <Link to="/stamp">Protect Your First File</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stamps.map((stamp) => {
                const Icon = getCategoryIcon(stamp.category);
                return (
                  <Link key={stamp.id} to={`/p/${stamp.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                      <CardContent className="p-4">
                        {stamp.thumbnailUrl ? (
                          <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 mb-3">
                            <img src={stamp.thumbnailUrl} alt={stamp.title} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="aspect-video rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 mb-3 flex items-center justify-center">
                            <Icon className="h-10 w-10 text-gray-300" />
                          </div>
                        )}
                        <div className="space-y-2">
                          <h3 className="font-medium truncate">{stamp.title}</h3>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-xs">
                                <Icon className="h-3 w-3 mr-1" />
                                {stamp.fileType?.toUpperCase()}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(stamp.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mb-1">
                            {legalStatusBadges(stamp).map((b) => (
                              <Badge key={b.label} variant="secondary" className="text-xs">{b.label}</Badge>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {stamp.creatorAttestationSignature ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    downloadCounselPacket(stamp.id).catch((e) => {
                                      const msg = e.message || '';
                                      if (msg.includes('REATTEST') || msg.includes('attestation')) {
                                        toast('Re-attestation required: sign your declaration again.', 'warning');
                                        window.location.href = `/stamp?sign=${stamp.id}`;
                                      } else {
                                        toast(msg || 'Download failed', 'error');
                                      }
                                    });
                                  }}
                                  className="p-1.5 rounded-md hover:bg-indigo-50 text-indigo-600"
                                  title={MARKETING.counselPacketName}
                                >
                                  <Scale className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <Link
                                  to={`/stamp?sign=${stamp.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded-md hover:bg-amber-50 text-amber-700"
                                  title="Sign your creator declaration first"
                                >
                                  <Scale className="h-3.5 w-3.5" />
                                </Link>
                              )}
                              <button
                                onClick={(e) => handleDownload(stamp, e)}
                                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-indigo-600 transition-colors"
                                title="Download stamped file"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(stamp.id, e)}
                                disabled={deleting === stamp.id}
                                className="p-1.5 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
                                title="Delete stamp"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
