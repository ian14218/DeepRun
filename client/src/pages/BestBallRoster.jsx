import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveContest, getMyLineup, addPlayer, removePlayer } from '@/services/bestBallService';
import PlayerMarket from '@/components/bestball/PlayerMarket';
import RosterPanel from '@/components/bestball/RosterPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function BestBallRoster() {
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [entry, setEntry] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const c = await getActiveContest();
      if (!c) {
        setError('No active contest');
        return;
      }
      setContest(c);

      const lineup = await getMyLineup(c.id);
      if (lineup) {
        setEntry(lineup);
        setRoster(lineup.roster || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async (playerId, pairedPlayerId = null) => {
    if (!entry) return;
    try {
      const updated = await addPlayer(entry.id, playerId, pairedPlayerId);
      setEntry(updated);
      // Refresh lineup to get full roster data
      const lineup = await getMyLineup(contest.id);
      if (lineup) setRoster(lineup.roster || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add player');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleRemove = async (playerId) => {
    if (!entry) return;
    try {
      const updated = await removePlayer(entry.id, playerId);
      setEntry(updated);
      const lineup = await getMyLineup(contest.id);
      if (lineup) setRoster(lineup.roster || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove player');
      setTimeout(() => setError(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!contest || !entry) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">
          {!contest ? 'No active contest' : 'You have not entered this contest yet.'}
        </p>
        <Button variant="outline" onClick={() => navigate('/best-ball')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Best Ball
        </Button>
      </div>
    );
  }

  const readOnly = contest.status !== 'open';

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/best-ball')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {readOnly ? 'My Lineup' : 'Build Your Lineup'}
          </h1>
          <p className="text-sm text-muted-foreground">{contest.name}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Market */}
        <div>
          <PlayerMarket
            contestId={contest.id}
            roster={roster}
            budgetRemaining={entry.budget_remaining}
            onAdd={handleAdd}
            readOnly={readOnly}
          />
        </div>

        {/* Roster sidebar */}
        <div className="order-first lg:order-last">
          <div className="lg:sticky lg:top-20">
            <RosterPanel
              entry={entry}
              roster={roster}
              rosterSize={contest.roster_size}
              totalBudget={contest.budget}
              onRemove={handleRemove}
              onSubmit={() => navigate('/best-ball')}
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
