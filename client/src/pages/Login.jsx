import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useDocumentTitle from '../hooks/useDocumentTitle';
import DeepRunLogo from '../components/DeepRunLogo';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function Login() {
  useDocumentTitle('Log In');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  function validateEmail(value) {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email format';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const errors = {};
    const emailErr = validateEmail(email);
    if (emailErr) errors.email = emailErr;
    if (!password) errors.password = 'Password is required';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({});

    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2 pb-2">
          <div className="flex items-center justify-center gap-2">
            <DeepRunLogo className="h-7 w-7 text-accent" />
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-accent">Deep</span>
              <span className="text-foreground">Run</span>
            </h1>
          </div>
          <h2 className="text-lg font-semibold text-foreground">Log In</h2>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => { const err = validateEmail(email); setFieldErrors((p) => ({ ...p, email: err })); }}
                autoComplete="email"
                placeholder="you@example.com"
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Logging in...' : 'Log In'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
