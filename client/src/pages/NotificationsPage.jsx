import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const token = localStorage.getItem('proofstamp_token');
      const res = await fetch(`${API_URL}/notifications?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(id) {
    const token = localStorage.getItem('proofstamp_token');
    await fetch(`${API_URL}/notifications/${id}/read`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    load();
  }

  async function markAllRead() {
    const token = localStorage.getItem('proofstamp_token');
    await fetch(`${API_URL}/notifications/read-all`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    load();
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-7 w-7" /> Alerts
          </h1>
          {notifications.some((n) => !n.read) && (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No notifications yet. Enable monitoring on stamped images to get theft alerts.
            </CardContent>
          </Card>
        ) : (
          notifications.map((n) => (
            <Card key={n.id} className={!n.read ? 'border-indigo-200 bg-indigo-50/30' : ''}>
              <CardContent className="p-4">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground mt-1">{n.body}</p>}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {n.link && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to={n.link.startsWith('http') ? n.link : n.link}>
                          {n.type === 'reattest' || n.title?.toLowerCase().includes('re-attest')
                            ? 'Re-sign Now'
                            : 'Open'}
                        </Link>
                      </Button>
                    )}
                    {!n.read && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </Layout>
  );
}
