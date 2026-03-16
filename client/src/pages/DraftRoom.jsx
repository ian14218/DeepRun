import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { getLeague } from '../services/leagueService';
import { getDraftState, startDraft, makePick, controlDraftTimer } from '../services/draftService';
import DraftBoard from '../components/DraftBoard';
import PlayerList from '../components/PlayerList';
import DraftChat from '../components/DraftChat';
import { Trophy, Play, Clock, Users, BarChart3, Pause, TimerOff, Timer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  const [pendingPick, setPendingPick] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerDisabled, setTimerDisabled] = useState(false);
  const [timerChangeSeconds, setTimerChangeSeconds] = useState('');
  useDocumentTitle('Draft Room');
  const timerRef = useRef(null);

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
      setSecondsLeft(null);
      if (timerRef.current) clearInterval(timerRef.current);
    });
    socket.on('draft:timer', ({ seconds_remaining, expires_at }) => {
      // Timer running — clear paused/disabled state
      setTimerPaused(false);
      setTimerDisabled(false);
      if (timerRef.current) clearInterval(timerRef.current);

      const updateCountdown = () => {
        const remaining = Math.max(0, Math.round((expires_at - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current);
        }
      };

      updateCountdown();
      timerRef.current = setInterval(updateCountdown, 1000);
    });
    socket.on('draft:timer-paused', ({ seconds_remaining }) => {
      setTimerPaused(true);
      setSecondsLeft(seconds_remaining);
      if (timerRef.current) clearInterval(timerRef.current);
    });
    socket.on('draft:timer-disabled', () => {
      setTimerDisabled(true);
      setTimerPaused(false);
      setSecondsLeft(null);
      if (timerRef.current) clearInterval(timerRef.current);
    });

    return () => {
      socket.emit('leave-draft', { leagueId });
      socket.off('draft:started');
      socket.off('draft:pick');
      socket.off('draft:turn');
      socket.off('draft:complete');
      socket.off('draft:timer');
      socket.off('draft:timer-paused');
      socket.off('draft:timer-disabled');
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [socket, leagueId, loadData]);

  async function handleStartDraft() {
    try {
      await startDraft(leagueId);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
  }

  function handlePickRequest(playerId, pairedPlayerId = null) {
    setPendingPick({ playerId, pairedPlayerId });
  }

  async function handleConfirmPick() {
    if (!pendingPick) return;
    try {
      await makePick(leagueId, pendingPick.playerId, pendingPick.pairedPlayerId);
      toast.success('Pick made!');
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setPendingPick(null);
    }
  }

  async function handleTimerControl(action, seconds) {
    try {
      await controlDraftTimer(leagueId, action, seconds);
      setTimerChangeSeconds('');
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
  const pickedPlayerIds = draftState.picks.flatMap((p) => [p.player_id, p.paired_player_id].filter(Boolean));
  const totalPicks = league.team_count * league.roster_size;

  // Find player name for pending pick confirmation — not used for display anymore
  const pendingPickName = 'this player';

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
          members={league.members}
          currentTurn={null}
        />
      </div>
    );
  }

  // Pre-draft state
  if (draftState.status === 'pre_draft') {
    const draftOrderMembers = league.custom_draft_order && league.members?.some((m) => m.draft_position)
      ? [...league.members].sort((a, b) => (a.draft_position || 0) - (b.draft_position || 0))
      : null;

    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold truncate">{league.name} — Draft Room</h1>
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

        {/* Show draft order if commissioner has set one */}
        {draftOrderMembers && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Draft Order</h3>
              <ol className="space-y-1.5">
                {draftOrderMembers.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
                    <span className={cn('font-medium', m.user_id === user.id && 'text-primary')}>
                      {m.username}
                      {m.user_id === user.id && ' (You)'}
                    </span>
                    {m.is_bot && <Badge variant="secondary" className="text-[10px]">CPU</Badge>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // In-progress state
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold truncate">{league.name} — Draft Room</h1>
        <Badge variant="secondary" className="text-xs w-fit">
          Pick {draftState.picks.length + 1} of {totalPicks}
        </Badge>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm">
          {error}
        </div>
      )}

      {/* Turn indicator with timer */}
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
            'text-sm font-medium flex-1',
            isMyTurn ? 'text-accent' : 'text-muted-foreground'
          )}>
            {isMyTurn
              ? "It's your turn to pick!"
              : `Waiting for ${draftState.current_turn?.username} to pick...`}
          </p>
          {timerDisabled ? (
            <Badge variant="outline" className="tabular-nums">
              <TimerOff className="h-3 w-3 mr-1" />
              No Timer
            </Badge>
          ) : timerPaused ? (
            <Badge variant="destructive" className="tabular-nums animate-pulse">
              <Pause className="h-3 w-3 mr-1" />
              PAUSED {secondsLeft !== null && `(${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')})`}
            </Badge>
          ) : secondsLeft !== null ? (
            <Badge variant={secondsLeft <= 15 ? 'destructive' : 'secondary'} className="tabular-nums">
              <Clock className="h-3 w-3 mr-1" />
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {/* Commissioner timer controls */}
      {isCommissioner && (
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-xs font-medium text-muted-foreground mr-1">Timer:</span>
            {timerDisabled ? (
              <>
                <Input
                  type="number"
                  min="1"
                  placeholder="90"
                  value={timerChangeSeconds}
                  onChange={(e) => setTimerChangeSeconds(e.target.value)}
                  className="w-20 h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => handleTimerControl('enable', parseInt(timerChangeSeconds, 10) || 90)}
                >
                  <Timer className="h-3 w-3 mr-1" />
                  Enable Timer
                </Button>
              </>
            ) : timerPaused ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => handleTimerControl('resume')}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Resume
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive"
                  onClick={() => handleTimerControl('disable')}
                >
                  <TimerOff className="h-3 w-3 mr-1" />
                  Disable Timer
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => handleTimerControl('pause')}
                >
                  <Pause className="h-3 w-3 mr-1" />
                  Pause
                </Button>
                <Input
                  type="number"
                  min="1"
                  placeholder="seconds"
                  value={timerChangeSeconds}
                  onChange={(e) => setTimerChangeSeconds(e.target.value)}
                  className="w-20 h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => {
                    const s = parseInt(timerChangeSeconds, 10);
                    if (s > 0) handleTimerControl('change', s);
                    else toast.error('Enter a valid number of seconds');
                  }}
                >
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive"
                  onClick={() => handleTimerControl('disable')}
                >
                  <TimerOff className="h-3 w-3 mr-1" />
                  Disable
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Draft board + Player list + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DraftBoard
            picks={draftState.picks}
            teamCount={league.team_count}
            rosterSize={league.roster_size}
            currentUserId={user.id}
            members={league.members}
            currentTurn={draftState.current_turn}
          />
        </div>
        <div className="flex flex-col gap-4 lg:h-[calc(100vh-280px)] lg:min-h-[400px] min-w-0">
          <div className="flex-1 min-h-0 min-w-0">
            <PlayerList
              canPick={isMyTurn}
              onPick={handlePickRequest}
              pickedPlayerIds={pickedPlayerIds}
            />
          </div>
          <div className="shrink-0">
            <DraftChat leagueId={leagueId} />
          </div>
        </div>
      </div>

      {/* Pick confirmation dialog */}
      <Dialog open={!!pendingPick} onOpenChange={(open) => !open && setPendingPick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Pick</DialogTitle>
            <DialogDescription>
              Are you sure you want to draft {pendingPickName}?
              {pendingPick?.pairedPlayerId && ' (First Four pair)'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPick(null)}>Cancel</Button>
            <Button onClick={handleConfirmPick}>Confirm Pick</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
