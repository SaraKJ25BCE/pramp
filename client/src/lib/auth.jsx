import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [passport, setPassport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('proofstamp_token');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchUser() {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      setPassport(res.data.passport);
    } catch {
      localStorage.removeItem('proofstamp_token');
    } finally {
      setLoading(false);
    }
  }

  function login(token) {
    localStorage.setItem('proofstamp_token', token);
    fetchUser();
  }

  function logout() {
    localStorage.removeItem('proofstamp_token');
    setUser(null);
    setPassport(null);
  }

  return (
    <AuthContext.Provider value={{ user, passport, loading, login, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
