import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileCheck, Plus, Calendar, Shield, FileImage, Music, Video,
  Code, File, Package, Type, Lock, Download, Trash2, AlertTriangle, Scale
} from 'lucide-react';
import { downloadCounselPacket, legalStatusBadges, MARKETING } from '@/lib/legalProof';
import { useToast } from '@/components/ui/toast';
import DeveloperSettings from '@/components/DeveloperSettings';

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
    } catch {
      window.open(url, '_blank');
    }
  }

  const categories = stamps.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <div className="min-h-screen bg-black text-white px-6 py-8 space-y-8 border-0">
        {/* Passport Header */}
        <Card className="bg-gradient-to-br from-zinc-950 to-black text-white rounded-[2rem] shadow-none border-0">
          <CardContent className="p-8">
            <div className="flex items-center gap-6">
              {user?.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-20 w-20 rounded-full ring-4 ring-white/10"
                />
              )}

              <div>
                <h1 className="text-3xl font-bold">
                  {passport?.displayName}
                </h1>

                <p className="text-zinc-400">
                  @{passport?.username}
                </p>

                <p className="text-zinc-500 text-sm mt-1">
                  Passport: {passport?.id}
                </p>

                <p className="text-zinc-400 text-xs mt-3 max-w-md leading-relaxed">
                  Your signing key is stored server-side (encrypted per
                  account) for convenience. Browser-side signing is on
                  the roadmap.
                </p>

                {usage &&
                  typeof usage.stampsRemaining === 'number' && (
                    <p className="text-zinc-300 text-sm mt-3">
                      {usage.stampsRemaining} stamps remaining this
                      month
                      {usage.tsaCallsThisMonth != null
                        ? ` · ${usage.tsaCallsThisMonth} TSA calls`
                        : ''}
                    </p>
                  )}
              </div>

              <div className="ml-auto text-right">
                <div className="text-5xl font-bold">
                  {stamps.length}
                </div>
                <div className="text-zinc-400 text-sm">
                  Files Protected
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Row */}
        {stamps.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(categories).map(([cat, count]) => {
              const Icon = getCategoryIcon(cat);

              return (
                <Card
                  key={cat}
                  className="bg-white text-black rounded-3xl border-0 shadow-lg"
                >
                  <CardContent className="p-5 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-zinc-100 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-black" />
                    </div>

                    <div>
                      <div className="text-2xl font-bold">
                        {count}
                      </div>
                      <div className="text-xs text-zinc-500 capitalize">
                        {cat}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Card className="bg-white text-black rounded-3xl border-0 shadow-lg">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-green-100 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-green-600" />
                </div>

                <div>
                  <div className="text-2xl font-bold">100%</div>
                  <div className="text-xs text-zinc-500">
                    Protected
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 flex-wrap">
          <Button
            asChild
            size="lg"
            className="bg-white text-black hover:bg-zinc-200 rounded-full px-6 h-12"
          >
            <Link to="/stamp">
              <Plus className="h-4 w-4 mr-2" />
              Protect a File
            </Link>
          </Button>

          <Button
            variant="outline"
            size="lg"
            asChild
            className="border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 rounded-full px-6 h-12"
          >
            <Link to="/verify">
              <FileCheck className="h-4 w-4 mr-2" />
              Verify Ownership
            </Link>
          </Button>
        </div>

        {/* Developer Settings */}
        <DeveloperSettings />

        {/* Protected Files */}
        <div>
          <h2 className="text-2xl font-semibold mb-5">
            Your Protected Files
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <Card
                  key={i}
                  className="bg-zinc-900 animate-pulse rounded-3xl border-0 shadow-none"
                >
                  <CardContent className="p-4">
                    <div className="h-40 bg-zinc-800 rounded-2xl mb-3" />
                    <div className="h-4 bg-zinc-800 rounded w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : stamps.length === 0 ? (
            <Card className="bg-zinc-950 rounded-[2rem] text-white border-0 shadow-none">
              <CardContent className="p-14 text-center">
                <Shield className="h-12 w-12 text-zinc-500 mx-auto mb-4" />

                <p className="text-xl font-medium">
                  No files protected yet
                </p>

                <p className="text-zinc-400 mb-5">
                  Start safeguarding your creative work —
                  any digital file
                </p>

                <Button
                  asChild
                  className="bg-white text-black hover:bg-zinc-200 rounded-full"
                >
                  <Link to="/stamp">
                    Protect Your First File
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {stamps.map((stamp) => {
                const Icon = getCategoryIcon(
                  stamp.category
                );

                return (
                  <Link
                    key={stamp.id}
                    to={`/p/${stamp.id}`}
                  >
                    <Card className="bg-white text-black rounded-[2rem] border-0 shadow-lg hover:shadow-2xl transition-all duration-300 h-full overflow-hidden">
                      <CardContent className="p-4">
                        {stamp.thumbnailUrl ? (
                          <div className="aspect-video rounded-2xl overflow-hidden bg-zinc-100 mb-4">
                            <img
                              src={stamp.thumbnailUrl}
                              alt={stamp.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video rounded-2xl bg-zinc-100 mb-4 flex items-center justify-center">
                            <Icon className="h-10 w-10 text-zinc-400" />
                          </div>
                        )}

                        <div className="space-y-3">
                          <h3 className="font-semibold truncate text-lg">
                            {stamp.title}
                          </h3>

                          <div className="flex items-center justify-between">
                            <Badge
                              variant="secondary"
                              className="bg-zinc-100 text-black"
                            >
                              <Icon className="h-3 w-3 mr-1" />
                              {stamp.fileType?.toUpperCase()}
                            </Badge>

                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(
                                stamp.createdAt
                              ).toLocaleDateString()}
                            </span>
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
