import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Shield } from 'lucide-react';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      login(token);
      // Check if user needs to set up username
      setTimeout(() => {
        navigate('/setup');
      }, 500);
    } else {
      navigate('/login?error=no_token');
    }
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Shield className="h-12 w-12 text-primary mx-auto animate-pulse" />
        <p className="mt-4 text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
