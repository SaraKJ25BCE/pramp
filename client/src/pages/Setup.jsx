import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AtSign, Scale, Radar, FileText } from 'lucide-react';

export default function Setup() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { passport, fetchUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (passport?.username) {
      navigate('/dashboard');
    }
  }, [passport, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError('Username must be 3-20 characters, letters, numbers, and underscores only');
      return;
    }

    setLoading(true);
    try {
      await api.patch('/passport/username', { username });
      await fetchUser();
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set username');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="w-full max-w-lg space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-9 w-9 text-primary" />
              </div>
            </div>
            <CardTitle>Choose Your Handle</CardTitle>
            <CardDescription>
              Your public username for share pages and verification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  className="pl-9"
                  maxLength={20}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || !username}>
                {loading ? 'Setting up...' : 'Claim Username'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What you get (full access)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {[
              { icon: Scale, text: 'RFC 3161 trusted timestamp + BSA 2023 Section 63 system certificate on every stamp' },
              { icon: FileText, text: 'Counsel Evidence Packet ZIP for DMCA notices and advocate review' },
              { icon: Radar, text: 'Theft monitoring for images (when TinEye is configured)' },
              { icon: Shield, text: 'Invisible watermark + verify for anyone' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex gap-2">
                <Icon className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
            <Link to="/legal-guide" className="text-indigo-600 hover:underline text-sm block pt-2">
              Read the India admissibility guide
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
