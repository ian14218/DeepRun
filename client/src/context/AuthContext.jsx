import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { setOnUnauthorized } from '../services/api';

export const AuthContext = createContext(null);

// Decode JWT payload without a library
function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null; // convert to ms
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const expiryTimer = useRef(null);

  const logout = useCallback(() => {
    clearTimeout(expiryTimer.current);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  // Schedule auto-logout when token expires
  function scheduleAutoLogout(jwt) {
    clearTimeout(expiryTimer.current);
    const expiry = getTokenExpiry(jwt);
    if (!expiry) return;
    const msUntilExpiry = expiry - Date.now();
    if (msUntilExpiry <= 0) {
      logout();
      return;
    }
    expiryTimer.current = setTimeout(logout, msUntilExpiry);
  }

  // Wire up the 401 interceptor to trigger logout
  useEffect(() => {
    setOnUnauthorized(logout);
    return () => setOnUnauthorized(null);
  }, [logout]);

  // On mount (or token change), schedule auto-logout
  useEffect(() => {
    if (token) {
      scheduleAutoLogout(token);
    }
    return () => clearTimeout(expiryTimer.current);
  }, [token]);

  async function login(email, password) {
    const res = await api.post('/api/auth/login', { email, password });
    const { token: newToken, user: newUser } = res.data;
    // Ensure is_admin is stored
    const userWithAdmin = { ...newUser, is_admin: newUser.is_admin || false };
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userWithAdmin));
    setToken(newToken);
    setUser(userWithAdmin);
  }

  async function register(username, email, password) {
    await api.post('/api/auth/register', { username, email, password });
    // Auto-login after registration
    await login(email, password);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
