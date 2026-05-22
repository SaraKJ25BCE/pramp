import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MARKETING } from '@/content/legalCopy';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';

export default function Login() {
  const apiUrl = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState('signin');
  const [step, setStep] = useState('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [setupToken, setSetupToken] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const oauthError = searchParams.get('error');

  function resetFlow(nextMode = mode) {
    setStep('email');
    setCode('');
    setSetupToken(null);
    setError('');
    setInfo('');
    setMode(nextMode);
  }

  function finishAuth(token, needsSetup) {
    login(token);
    navigate(needsSetup ? '/setup' : '/dashboard');
  }

  async function handleSendCode() {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const purpose = mode === 'signin' ? 'login' : 'signup';
      const res = await api.post('/auth/email/send-code', { email, purpose });
      setInfo(res.data.devHint || 'Check your email for a 6-digit code.');
      setStep('code');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const purpose = mode === 'signin' ? 'login' : 'signup';
      const res = await api.post('/auth/email/verify-code', { email, code, purpose });

      if (purpose === 'login') {
        finishAuth(res.data.token, res.data.needsSetup);
        return;
      }

      setSetupToken(res.data.setupToken);
      setStep('profile');
      setInfo('Almost done — tell us your name.');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteSignup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/email/complete-signup', {
        setupToken,
        displayName,
        username: username || undefined,
      });
      finishAuth(res.data.token, res.data.needsSetup);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-9 w-9 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl">ProofStamp</CardTitle>
          <CardDescription className="text-base">{MARKETING.loginSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {oauthError && (
            <p className="text-sm text-destructive text-center">Sign in failed. Please try again.</p>
          )}

          <div className="flex rounded-lg border p-1 bg-muted/40">
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
              onClick={() => resetFlow('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
              onClick={() => resetFlow('signup')}
            >
              Sign up
            </button>
          </div>

          {step === 'email' && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCode();
              }}
            >
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-muted-foreground">{info}</p>}
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? 'Sending...' : 'Send code'}
              </Button>
            </form>
          )}

          {step === 'code' && (
            <form className="space-y-3" onSubmit={handleVerifyCode}>
              <p className="text-sm text-muted-foreground text-center">
                Code sent to <span className="font-medium text-foreground">{email}</span>
              </p>
              <Input
                inputMode="numeric"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="text-center text-lg tracking-widest"
                required
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-muted-foreground">{info}</p>}
              <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
                {loading ? 'Verifying...' : mode === 'signin' ? 'Sign in' : 'Verify email'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={handleSendCode} disabled={loading}>
                Resend code
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
                Change email
              </Button>
            </form>
          )}

          {step === 'profile' && mode === 'signup' && (
            <form className="space-y-3" onSubmit={handleCompleteSignup}>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
              <Input
                placeholder="Username (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                maxLength={20}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || !displayName}>
                {loading ? 'Creating account...' : 'Create account'}
              </Button>
            </form>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button className="w-full h-12 text-base" variant="outline" asChild>
            <a href={`${apiUrl}/auth/google`}>
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </a>
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to ProofStamp&apos;s{' '}
            <Link to="/terms" className="text-indigo-600 hover:underline">Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
