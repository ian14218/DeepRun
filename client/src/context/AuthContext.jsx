import { createContext, useContext, useState } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem('token'));

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

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
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
