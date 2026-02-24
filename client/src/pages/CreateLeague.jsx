import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLeague } from '../services/leagueService';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function CreateLeague() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [teamCount, setTeamCount] = useState(8);
  const [rosterSize, setRosterSize] = useState(10);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const count = Number(teamCount);
    if (count < 4 || count > 20) {
      setError('Team count must be between 4 and 20.');
      return;
    }
    if (!name.trim()) {
      setError('League name is required.');
      return;
    }

    setLoading(true);
    try {
      const league = await createLeague(name.trim(), count, Number(rosterSize));
      toast.success('League created!');
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create league.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create a League</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">League Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="March Madness 2026"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team_count">Team Count (4-20)</Label>
              <Input
                id="team_count"
                type="number"
                min={4}
                max={20}
                value={teamCount}
                onChange={(e) => setTeamCount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roster_size">Roster Size</Label>
              <Input
                id="roster_size"
                type="number"
                min={1}
                value={rosterSize}
                onChange={(e) => setRosterSize(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating...' : 'Create League'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
