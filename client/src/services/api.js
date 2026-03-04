import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : ''),
});

// Attach JWT from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Logout callback — set by AuthContext so api layer can trigger logout on 401
let onUnauthorized = null;
export function setOnUnauthorized(callback) {
  onUnauthorized = callback;
}

// Auto-logout on 401 responses (expired/invalid token)
// Skip auth endpoints so a bad login/register doesn't trigger logout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthRoute = url.includes('/api/auth/');
    if (error.response?.status === 401 && onUnauthorized && !isAuthRoute) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default api;
