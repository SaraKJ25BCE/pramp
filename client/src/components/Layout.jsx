import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Shield, LogOut, User, Lock, Search, Radar, FileWarning } from 'lucide-react';

export default function Layout({ children }) {
  const { user, passport, logout } = useAuth();
  const navigate = useNavigate();

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
