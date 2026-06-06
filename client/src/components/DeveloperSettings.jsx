import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Key, Webhook, Loader2, Trash2, Plus, Copy } from 'lucide-react';

export default function DeveloperSettings() {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [maxWebhooks, setMaxWebhooks] = useState(3);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookLabel, setWebhookLabel] = useState('');
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState(null);

  async function load() {
    try {
      const [keysRes, hooksRes] = await Promise.all([
        api.get('/passport/api-keys'),
        api.get('/passport/webhooks'),
      ]);
      setApiKeys(keysRes.data.apiKeys || []);
      setWebhooks(hooksRes.data.endpoints || []);
      setMaxWebhooks(hooksRes.data.maxEndpoints || 3);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to load developer settings', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createApiKey() {
    try {
      const res = await api.post('/passport/api-keys', { name: newKeyName || 'API Key' });
      setCreatedKey(res.data.apiKey);
      setNewKeyName('');
      toast('API key created — copy it now', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create API key', 'error');
    }
  }

  async function revokeKey(id) {
    try {
      await api.delete(`/passport/api-keys/${id}`);
      toast('API key revoked', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to revoke key', 'error');
    }
  }

  async function addWebhook() {
    try {
      const res = await api.post('/passport/webhooks', {
        url: webhookUrl,
        label: webhookLabel || undefined,
      });
      setCreatedWebhookSecret(res.data.secret);
      setWebhookUrl('');
      setWebhookLabel('');
      toast('Webhook endpoint added', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to add webhook', 'error');
    }
  }

  async function removeWebhook(id) {
    try {
      await api.delete(`/passport/webhooks/${id}`);
      toast('Webhook removed', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to remove webhook', 'error');
    }
  }

  function copyText(text, label) {
    navigator.clipboard.writeText(text);
    toast(`${label} copied`, 'success');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-950 border-0 shadow-none rounded-[2rem] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="h-5 w-5" /> API Keys
          </CardTitle>
          <CardDescription>
            Use header <code className="text-xs">X-ProofStamp-Api-Key</code> for programmatic stamping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {createdKey && (
            <div className="p-3 rounded-lg border border-green-200 bg-green-50 text-sm">
              <p className="font-medium text-green-900 mb-1">New key (shown once)</p>
              <code className="break-all text-xs">{createdKey}</code>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => copyText(createdKey, 'API key')}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Key label (optional)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
            <Button onClick={createApiKey}>
              <Plus className="h-4 w-4 mr-1" /> Generate
            </Button>
          </div>
          {apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <ul className="space-y-2">
              {apiKeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                  <span>
                    {k.name || 'API Key'} · <code>{k.keyPrefix}…</code>
                    {k.lastUsedAt && (
                      <span className="text-muted-foreground ml-2">
                        last used {new Date(k.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="bg-zinc-950 border-0 shadow-none rounded-[2rem] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Webhook className="h-5 w-5" /> Webhooks
          </CardTitle>
          <CardDescription>
            Up to {maxWebhooks} HTTPS endpoints. Events: stamp.created, monitor.alert.new, takedown.resolved.
            Payloads are signed with HMAC-SHA256 in <code className="text-xs">X-ProofStamp-Signature</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {createdWebhookSecret && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
              <p className="font-medium text-amber-900 mb-1">Signing secret (shown once)</p>
              <code className="break-all text-xs">{createdWebhookSecret}</code>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => copyText(createdWebhookSecret, 'Secret')}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
            </div>
          )}
          {webhooks.length < maxWebhooks && (
            <div className="space-y-2">
              <Input
                className="bg-black border-zinc-800 text-white rounded-2xl"
                placeholder="https://your-server.com/webhooks/proofstamp"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <Input
                className="bg-black border-zinc-800 text-white rounded-2xl"
                placeholder="Label (optional)"
                value={webhookLabel}
                onChange={(e) => setWebhookLabel(e.target.value)}
              />
              <Button onClick={addWebhook} disabled={!webhookUrl.startsWith('https://')}>
                <Plus className="h-4 w-4 mr-1" /> Add endpoint
              </Button>
            </div>
          )}
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhook endpoints configured.</p>
          ) : (
            <ul className="space-y-2">
              {webhooks.map((w) => (
                <li key={w.id} className="flex items-center justify-between p-2 border rounded-lg text-sm gap-2">
                  <span className="truncate">
                    {w.label && <strong>{w.label}: </strong>}
                    <code className="text-xs">{w.url}</code>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => removeWebhook(w.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
