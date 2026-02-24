import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinLeague } from '../services/leagueService';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function JoinLeague() {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!inviteCode.trim()) {
      setError('Invite code is required.');
      return;
    }

    setLoading(true);
    try {
      const result = await joinLeague(inviteCode.trim().toUpperCase());
      toast.success('League joined!');
      navigate(`/leagues/${result.league_id}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to join league.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Join a League</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite_code">Invite Code</Label>
              <Input
                id="invite_code"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. ABCD1234"
                className="font-mono uppercase tracking-widest text-center text-lg"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Joining...' : 'Join League'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
