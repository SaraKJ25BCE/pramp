import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Shield, LogOut, User, Lock, Search, Radar, FileWarning, Bell } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

export default function Layout({ children }) {
  const { user, passport, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return undefined;
    const token = localStorage.getItem('proofstamp_token');
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${API_URL}/notifications?limit=1`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUnreadCount(data.unreadCount || 0);
      } catch {
        /* ignore */
      }
    }

    poll();
    const id = setInterval(poll, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-border bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/dashboard" className="flex items-center gap-2">
              <Shield className="h-7 w-7 text-primary" />
              <span className="font-bold text-xl text-foreground">ProofStamp</span>
            </Link>

            <div className="flex items-center gap-1">
              {user && (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/stamp" className="flex items-center gap-1.5">
                      <Lock className="h-4 w-4" />
                      Protect
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/verify" className="flex items-center gap-1.5">
                      <Search className="h-4 w-4" />
                      Verify
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/monitor" className="flex items-center gap-1.5">
                      <Radar className="h-4 w-4" />
                      Monitor
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="relative">
                    <Link to="/notifications" className="flex items-center gap-1.5">
                      <Bell className="h-4 w-4" />
                      Alerts
                      {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/takedowns" className="flex items-center gap-1.5">
                      <FileWarning className="h-4 w-4" />
                      Takedowns
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/dashboard" className="flex items-center gap-1.5">
                      <User className="h-4 w-4" />
                      {passport?.username ? `@${passport.username}` : 'Profile'}
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
