import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getLeague } from '../services/leagueService';
import { getDraftState, startDraft, makePick } from '../services/draftService';
import DraftBoard from '../components/DraftBoard';
import PlayerList from '../components/PlayerList';
import { Trophy, Play, Clock, Users, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function DraftRoom() {
  const { id: leagueId } = useParams();
  const { user } = useAuth();
  const socket = useSocket();

  const [league, setLeague] = useState(null);
  const [draftState, setDraftState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [leagueData, draft] = await Promise.all([
        getLeague(leagueId),
        getDraftState(leagueId),
      ]);
      setLeague(leagueData);
      setDraftState(draft);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join-draft', { leagueId });
    socket.on('draft:started', () => loadData());
    socket.on('draft:pick', () => loadData());
    socket.on('draft:turn', (turn) => {
      setDraftState((prev) => (prev ? { ...prev, current_turn: turn } : prev));
    });
    socket.on('draft:complete', () => {
      setDraftState((prev) =>
        prev ? { ...prev, status: 'completed', current_turn: null } : prev
      );
    });

    return () => {
      socket.emit('leave-draft', { leagueId });
      socket.off('draft:started');
      socket.off('draft:pick');
      socket.off('draft:turn');
      socket.off('draft:complete');
    };
  }, [socket, leagueId, loadData]);

  async function handleStartDraft() {
    try {
      await startDraft(leagueId);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  async function handlePick(playerId) {
    try {
      await makePick(leagueId, playerId);
      toast.success('Pick made!');
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!draftState || !league) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">Draft not found.</p>
        </CardContent>
      </Card>
    );
  }

  const isCommissioner = league.commissioner_id === user.id;
  const isMyTurn = draftState.current_turn?.user_id === user.id;
  const pickedPlayerIds = draftState.picks.map((p) => p.player_id);
  const totalPicks = league.team_count * league.roster_size;

  // Completed state
  if (draftState.status === 'completed') {
    return (
      <div className="space-y-6">
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Trophy className="h-12 w-12 text-accent mb-3" />
            <h2 className="text-xl font-bold mb-1">Draft Complete!</h2>
            <p className="text-muted-foreground text-sm mb-4">All picks have been made.</p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to={`/leagues/${leagueId}/my-team`}>
                  <Users className="h-4 w-4 mr-1.5" />
                  View My Team
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/leagues/${leagueId}/standings`}>
                  <BarChart3 className="h-4 w-4 mr-1.5" />
                  View Standings
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <DraftBoard
          picks={draftState.picks}
          teamCount={league.team_count}
          rosterSize={league.roster_size}
          currentUserId={user.id}
        />
      </div>
    );
  }

  // Pre-draft state
  if (draftState.status === 'pre_draft') {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{league.name} — Draft Room</h1>
        {error && (
          <div role="alert" className="p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm">
            {error}
          </div>
        )}
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            {isCommissioner ? (
              <>
                <Play className="h-12 w-12 text-primary mb-3" />
                <h2 className="text-lg font-semibold mb-2">Ready to Start</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  {league.members?.length ?? 0} / {league.team_count} players joined
                </p>
                <Button onClick={handleStartDraft} size="lg">
                  <Play className="h-4 w-4 mr-1.5" />
                  Start Draft
                </Button>
              </>
            ) : (
              <>
                <Clock className="h-12 w-12 text-muted-foreground mb-3" />
                <h2 className="text-lg font-semibold mb-2">Waiting for Draft</h2>
                <p className="text-muted-foreground text-sm">
                  The commissioner will start the draft soon.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // In-progress state
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{league.name} — Draft Room</h1>
        <Badge variant="secondary" className="text-xs w-fit">
          Pick {draftState.picks.length + 1} of {totalPicks}
        </Badge>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm">
          {error}
        </div>
      )}

      {/* Turn indicator */}
      <Card className={cn(
        'border transition-colors',
        isMyTurn ? 'border-accent bg-accent/10' : 'border-border'
      )}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className={cn(
            'h-3 w-3 rounded-full shrink-0',
            isMyTurn ? 'bg-accent animate-pulse' : 'bg-muted-foreground/30'
          )} />
          <p className={cn(
            'text-sm font-medium',
            isMyTurn ? 'text-accent' : 'text-muted-foreground'
          )}>
            {isMyTurn
              ? "It's your turn to pick!"
              : `Waiting for ${draftState.current_turn?.username} to pick...`}
          </p>
        </CardContent>
      </Card>

      {/* Draft board + Player list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DraftBoard
            picks={draftState.picks}
            teamCount={league.team_count}
            rosterSize={league.roster_size}
            currentUserId={user.id}
          />
        </div>
        <div>
          <PlayerList
            canPick={isMyTurn}
            onPick={handlePick}
            pickedPlayerIds={pickedPlayerIds}
          />
        </div>
      </div>
    </div>
  );
}
