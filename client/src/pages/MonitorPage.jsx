import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Radar, Shield, AlertTriangle, Eye, EyeOff, Loader2,
  ScanSearch, Bell, CheckCircle2, FileWarning, Info
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';

export default function MonitorPage() {
  const { toast } = useToast();
  const [monitors, setMonitors] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(null);
  const [stamps, setStamps] = useState([]);
  const [tab, setTab] = useState('overview');
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [monRes, alertRes, stampRes, capRes] = await Promise.all([
        api.get('/monitor'),
        api.get('/monitor/alerts'),
        api.get('/passport/me'),
        api.get('/monitor/capabilities').catch(() => ({ data: null })),
      ]);
      setCapabilities(capRes.data);
      setMonitors(monRes.data.monitors);
      setStats(monRes.data.stats);
      setAlerts(alertRes.data.alerts);
      setStamps(stampRes.data.passport.stamps?.filter(s => s.category === 'image') || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function enableMonitor(stampId) {
    try {
      await api.post(`/monitor/enable/${stampId}`);
      loadData();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to enable monitoring', 'error');
    }
  }

  async function disableMonitor(stampId) {
    try {
      await api.post(`/monitor/disable/${stampId}`);
      loadData();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed', 'error');
    }
  }

  async function runScan(stampId) {
    setScanning(stampId);
    try {
      const res = await api.post(`/monitor/scan/${stampId}`);
      toast(`Scan complete: ${res.data.scanned} checked, ${res.data.matchesFound} matches, ${res.data.newAlerts} new alerts`, 'success');
      loadData();
    } catch (err) {
      toast(err.response?.data?.error || 'Scan failed', 'error');
    } finally {
      setScanning(null);
    }
  }

  async function dismissAlert(alertId) {
    try {
      await api.patch(`/monitor/alerts/${alertId}`, { status: 'dismissed' });
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'dismissed' } : a));
    } catch (err) {
      console.error(err);
    }
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

  const unmonitoredStamps = stamps.filter(s => !monitors.find(m => m.stampId === s.id));

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {capabilities && !capabilities.webScan && (
          <div className="flex gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
            <Info className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Web-wide scan off</p>
              <p className="mt-1 text-amber-800">
                Add <code className="text-xs">TINEYE_API_KEY</code> or Google Vision on the server to detect copies on Instagram, Pinterest, etc.
                You still get in-app alerts and <strong>Similar work on ProofStamp</strong> scans.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Radar className="h-8 w-8 text-indigo-600" />
              Theft Monitor
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your images across the internet. Get alerted when copies are detected.
            </p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-indigo-600">{stats.activeMonitors}</div>
                <p className="text-xs text-muted-foreground mt-1">Active Monitors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-amber-600">{stats.newAlerts}</div>
                <p className="text-xs text-muted-foreground mt-1">New Alerts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-gray-700">{stats.totalAlerts}</div>
                <p className="text-xs text-muted-foreground mt-1">Total Detections</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{stats.totalMonitored}</div>
                <p className="text-xs text-muted-foreground mt-1">Images Tracked</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <Button variant={tab === 'overview' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('overview')}>
            Active Monitors
          </Button>
          <Button variant={tab === 'alerts' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('alerts')}>
            Alerts {stats?.newAlerts > 0 && <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">{stats.newAlerts}</Badge>}
          </Button>
          <Button variant={tab === 'add' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('add')}>
            Add Images
          </Button>
        </div>

        {/* Active Monitors */}
        {tab === 'overview' && (
          <div className="space-y-3">
            {monitors.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Radar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No monitors active</h3>
                  <p className="text-muted-foreground mb-4">Start monitoring your images to detect unauthorized use</p>
                  <Button onClick={() => setTab('add')}>Enable Monitoring</Button>
                </CardContent>
              </Card>
            ) : (
              monitors.map(monitor => (
                <Card key={monitor.id} className={monitor.status === 'active' ? '' : 'opacity-60'}>
                  <CardContent className="p-4 flex items-center gap-4">
                    {monitor.stamp.thumbnailUrl ? (
                      <img src={monitor.stamp.thumbnailUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Shield className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{monitor.stamp.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">{monitor.stamp.id}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant={monitor.status === 'active' ? 'default' : 'secondary'}>
                          {monitor.status === 'active' ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                          {monitor.status}
                        </Badge>
                        {monitor.matchCount > 0 && (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {monitor.matchCount} detections
                          </Badge>
                        )}
                        {monitor.lastScanAt && (
                          <span className="text-xs text-muted-foreground">
                            Last scan: {new Date(monitor.lastScanAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runScan(monitor.stampId)}
                        disabled={scanning === monitor.stampId}
                      >
                        {scanning === monitor.stampId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                      </Button>
                      {monitor.status === 'active' ? (
                        <Button size="sm" variant="ghost" onClick={() => disableMonitor(monitor.stampId)}>
                          <EyeOff className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => enableMonitor(monitor.stampId)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Alerts */}
        {tab === 'alerts' && (
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No alerts yet</h3>
                  <p className="text-muted-foreground">When we detect copies of your work, alerts will appear here</p>
                </CardContent>
              </Card>
            ) : (
              alerts.map(alert => (
                <Card key={alert.id} className={`${alert.status === 'new' ? 'border-amber-200 bg-amber-50/30' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {alert.screenshotUrl ? (
                        <img src={alert.screenshotUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-red-50 flex items-center justify-center">
                          <AlertTriangle className="h-6 w-6 text-red-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{alert.sourceName || 'Unknown source'}</p>
                          <Badge variant="outline" className="text-xs">
                            {alert.sourceEngine === 'internal'
                              ? 'Similar work on ProofStamp'
                              : 'Found on the web'}
                          </Badge>
                          <Badge variant={alert.status === 'new' ? 'destructive' : 'secondary'} className="text-xs">
                            {alert.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{alert.sourceUrl}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {Math.round(alert.confidence * 100)}% match
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(alert.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Button size="sm" variant="destructive" asChild>
                          <Link to={`/takedowns?stampId=${alert.stampId}&url=${encodeURIComponent(alert.sourceUrl)}&alertId=${alert.id}`}>
                            <FileWarning className="h-3.5 w-3.5 mr-1" /> Takedown
                          </Link>
                        </Button>
                        {alert.status === 'new' && (
                          <Button size="sm" variant="ghost" onClick={() => dismissAlert(alert.id)}>
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Add Images to Monitor */}
        {tab === 'add' && (
          <div className="space-y-3">
            {unmonitoredStamps.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">All images are being monitored</h3>
                  <p className="text-muted-foreground">Stamp more images to add them to monitoring</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Select images to start monitoring for unauthorized copies:</p>
                {unmonitoredStamps.map(stamp => (
                  <Card key={stamp.id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      {stamp.thumbnailUrl ? (
                        <img src={stamp.thumbnailUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-gray-100" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{stamp.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{stamp.id}</p>
                      </div>
                      <Button size="sm" onClick={() => enableMonitor(stamp.id)}>
                        <Eye className="h-4 w-4 mr-1.5" /> Enable Monitoring
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
