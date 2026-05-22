import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
import Setup from '@/pages/Setup';
import Dashboard from '@/pages/Dashboard';
import StampPage from '@/pages/StampPage';
import VerifyPage from '@/pages/VerifyPage';
import PublicPassport from '@/pages/PublicPassport';
import LandingPage from '@/pages/LandingPage';
import SharePage from '@/pages/SharePage';
import MonitorPage from '@/pages/MonitorPage';
import TakedownPage from '@/pages/TakedownPage';
import RegistryPage from '@/pages/RegistryPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import LegalGuidePage from '@/pages/LegalGuidePage';
import RegisterCopyrightPage from '@/pages/RegisterCopyrightPage';
import NotificationsPage from '@/pages/NotificationsPage';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from '@/components/ui/toast'; 

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/stamp" element={<ProtectedRoute><StampPage /></ProtectedRoute>} />
      <Route path="/monitor" element={<ProtectedRoute><MonitorPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/takedowns" element={<ProtectedRoute><TakedownPage /></ProtectedRoute>} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/registry" element={<RegistryPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/legal-guide" element={<LegalGuidePage />} />
      <Route path="/register-copyright" element={<RegisterCopyrightPage />} />
      <Route path="/p/:stampId" element={<SharePage />} />
      <Route path="/u/:username" element={<PublicPassport />} />
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
