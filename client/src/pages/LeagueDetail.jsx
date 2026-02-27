import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { getLeague, fillWithBots, updateLeague, leaveLeague, removeMember } from '../services/leagueService';
import { getStandings, getTeamRoster } from '../services/standingsService';
import StandingsTable from '../components/StandingsTable';
import PlayerRow from '../components/PlayerRow';
import TeamLogo from '../components/TeamLogo';
import { BarChart3, Users, Swords, Tv, Trophy, Copy, Bot, Play, LogOut, UserMinus, Pencil, Crown, Target, Heart, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ROUNDS = [
  'Round of 64',
  'Round of 32',
  'Sweet 16',
  'Elite 8',
  'Final Four',
  'Championship',
];

const STATUS_CONFIG = {
  pre_draft: { label: 'Pre-Draft', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'success' },
  completed: { label: 'Completed', variant: 'outline' },
};

const NAV_CARDS = [
  { label: 'Standings', description: 'View league rankings', path: 'standings', icon: BarChart3 },
  { label: 'My Team', description: 'Manage your roster', path: 'my-team', icon: Users },
  { label: 'Draft', description: 'Draft room', path: 'draft', icon: Swords },
  { label: 'Scoreboard', description: 'Live game scores', path: 'scoreboard', icon: Tv },
  { label: 'Bracket', description: 'Tournament bracket', path: 'bracket', icon: Trophy },
];

export default function LeagueDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [standings, setStandings] = useState([]);
  const [tournamentCompleted, setTournamentCompleted] = useState(false);
  const [myRoster, setMyRoster] = useState([]);
  const [myMemberId, setMyMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fillingBots, setFillingBots] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(null); // member to remove
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTeamCount, setEditTeamCount] = useState(8);
  const [editRosterSize, setEditRosterSize] = useState(10);
  const [editDraftTimer, setEditDraftTimer] = useState(90);
  useDocumentTitle(league?.name || 'League');

  async function handleFillBots() {
    setFillingBots(true);
    try {
      await fillWithBots(id);
      const leagueData = await getLeague(id);
      setLeague(leagueData);
      toast.success('CPU bots added!');
    } catch {
      toast.error('Failed to fill with bots.');
    } finally {
      setFillingBots(false);
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(league.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleLeaveLeague() {
    try {
      await leaveLeague(id);
      toast.success('Left league');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to leave league.');
    } finally {
      setShowLeaveDialog(false);
    }
  }

  async function handleRemoveMember() {
    if (!showRemoveDialog) return;
    try {
      await removeMember(id, showRemoveDialog.user_id);
      const leagueData = await getLeague(id);
      setLeague(leagueData);
      toast.success(`${showRemoveDialog.username} removed`);
    } catch {
      toast.error('Failed to remove member.');
    } finally {
      setShowRemoveDialog(null);
    }
  }

  function openEditDialog() {
    setEditName(league.name);
    setEditTeamCount(league.team_count);
    setEditRosterSize(league.roster_size);
    setEditDraftTimer(league.draft_timer_seconds ?? 90);
    setShowEditDialog(true);
  }

  async function handleEditLeague(e) {
    e.preventDefault();
    try {
      const updated = await updateLeague(id, {
        name: editName,
        team_count: Number(editTeamCount),
        roster_size: Number(editRosterSize),
        draft_timer_seconds: Number(editDraftTimer),
      });
      setLeague((prev) => ({ ...prev, ...updated }));
      toast.success('League updated');
      setShowEditDialog(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update league.');
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [leagueData, standingsResp] = await Promise.all([
          getLeague(id),
          getStandings(id).catch(() => ({ standings: [], tournament_completed: false })),
        ]);
        setLeague(leagueData);
        const standingsData = standingsResp.standings || standingsResp;
        setStandings(Array.isArray(standingsData) ? standingsData : []);
        setTournamentCompleted(standingsResp.tournament_completed || false);

        if (leagueData.draft_status === 'completed') {
          const myMember = leagueData.members?.find((m) => m.user_id === user?.id);
          if (myMember) {
            setMyMemberId(myMember.id);
            const rosterData = await getTeamRoster(id, myMember.id).catch(() => []);
            const sorted = [
              ...rosterData.filter((p) => !p.is_eliminated),
              ...rosterData.filter((p) => p.is_eliminated),
            ];
            setMyRoster(sorted);
          }
        }
      } catch {
        setError('Failed to load league.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, user?.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) return <p className="text-destructive">{error}</p>;
  if (!league) return null;

  const isCommissioner = user?.id === league.commissioner_id;
  const draftDone = league.draft_status === 'completed';
  const myRow = standings.find((s) => s.user_id === user?.id);
  const myRank = myRow ? standings.indexOf(myRow) + 1 : null;
  const playersAlive = myRow?.active_players ?? null;
  const playersTotal = myRow ? myRow.active_players + myRow.eliminated_players : null;
  const leader = standings.length > 0 ? standings[0] : null;
  const status = STATUS_CONFIG[league.draft_status] || { label: league.draft_status, variant: 'secondary' };

  // Find the best single-round performer on user's roster
  const topPerformer = myRoster.length > 0
    ? myRoster.reduce((best, p) => (p.total_points > (best?.total_points ?? -1) ? p : best), null)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">{league.name}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            {isCommissioner && league.draft_status === 'pre_draft' && (
              <Button variant="ghost" size="icon" onClick={openEditDialog} className="h-7 w-7">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {league.members?.length ?? 0} / {league.team_count} members · Roster size: {league.roster_size}
          </p>
        </div>
      </div>

      {/* Commissioner invite code */}
      {isCommissioner && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">Invite Code</p>
              <p className="font-mono text-lg tracking-widest text-foreground">{league.invite_code}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopyCode} className="shrink-0">
              <Copy className="h-4 w-4 mr-1.5" />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Commissioner actions */}
      {isCommissioner && league.draft_status === 'pre_draft' && (
        <div className="flex gap-2 flex-wrap">
          {(league.members?.length ?? 0) < league.team_count && (
            <Button variant="outline" onClick={handleFillBots} disabled={fillingBots}>
              <Bot className="h-4 w-4 mr-1.5" />
              {fillingBots ? 'Adding Bots...' : 'Fill with CPU Bots'}
            </Button>
          )}
          <Button asChild>
            <Link to={`/leagues/${id}/draft`}>
              <Play className="h-4 w-4 mr-1.5" />
              Go to Draft Room
            </Link>
          </Button>
        </div>
      )}

      {/* Leave league (non-commissioner, pre-draft) */}
      {!isCommissioner && league.draft_status === 'pre_draft' && (
        <Button variant="outline" className="text-destructive" onClick={() => setShowLeaveDialog(true)}>
          <LogOut className="h-4 w-4 mr-1.5" />
          Leave League
        </Button>
      )}

      {/* ===== POST-DRAFT DASHBOARD ===== */}
      {draftDone && myRow && (
        <>
          {/* Champion / Leader Banner */}
          {leader && leader.total_score > 0 && (
            <Card className={cn(
              'overflow-hidden border-2',
              tournamentCompleted
                ? 'border-yellow-500/50 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-yellow-500/10'
                : 'border-primary/30 bg-gradient-to-r from-primary/5 to-transparent'
            )}>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'rounded-full p-3',
                    tournamentCompleted ? 'bg-yellow-500/20' : 'bg-primary/10'
                  )}>
                    <Trophy className={cn(
                      'h-7 w-7',
                      tournamentCompleted ? 'text-yellow-500' : 'text-primary'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-xs font-semibold uppercase tracking-wide mb-0.5',
                      tournamentCompleted ? 'text-yellow-500' : 'text-primary'
                    )}>
                      {tournamentCompleted ? 'League Champion' : 'League Leader'}
                    </p>
                    <p className="text-xl font-bold truncate">
                      {leader.team_name || leader.username}
                      {leader.user_id === user?.id && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">(You!)</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold">{leader.total_score}</p>
                    <p className="text-xs text-muted-foreground">points</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stat Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Your Rank */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-primary/10 p-1.5">
                    <Crown className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Rank</p>
                </div>
                <p className="text-2xl font-bold">
                  #{myRank}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    of {standings.length}
                  </span>
                </p>
              </CardContent>
            </Card>

            {/* Your Points */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-primary/10 p-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Points</p>
                </div>
                <p className="text-2xl font-bold">{myRow.total_score}</p>
                {leader && leader.user_id !== user?.id && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {myRow.total_score - leader.total_score} from 1st
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Players Alive */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-success/10 p-1.5">
                    <Heart className="h-4 w-4 text-success" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Players Alive</p>
                </div>
                <p className="text-2xl font-bold">
                  {playersAlive}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    of {playersTotal}
                  </span>
                </p>
                {playersTotal > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-success transition-all"
                      style={{ width: `${(playersAlive / playersTotal) * 100}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Scorer */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md bg-yellow-500/10 p-1.5">
                    <Target className="h-4 w-4 text-yellow-500" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Top Scorer</p>
                </div>
                {topPerformer ? (
                  <>
                    <p className="text-lg font-bold truncate">{topPerformer.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <TeamLogo externalId={topPerformer.team_external_id} teamName={topPerformer.team_name} size={14} />
                      {topPerformer.total_points} pts
                      {topPerformer.is_eliminated && (
                        <Badge variant="destructive" className="text-[9px] ml-1 py-0">OUT</Badge>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No players yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Two-column: Standings + My Roster */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* League Standings */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">League Standings</h2>
                <Link
                  to={`/leagues/${id}/standings`}
                  className="text-sm text-primary hover:underline"
                >
                  Full Standings
                </Link>
              </div>
              <StandingsTable standings={standings} leagueId={id} />
            </div>

            {/* My Roster */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">My Roster</h2>
                {myMemberId && (
                  <Link
                    to={`/leagues/${id}/team/${myMemberId}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Full Roster
                  </Link>
                )}
              </div>
              {myRoster.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center text-muted-foreground text-sm">
                    No players on your roster yet.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border">
                          <TableHead>Player</TableHead>
                          <TableHead className="hidden sm:table-cell">Team</TableHead>
                          <TableHead className="text-right">Pts</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myRoster.map((player) => (
                          <TableRow
                            key={player.player_id}
                            className={cn(
                              'border-border',
                              player.is_eliminated && 'bg-destructive/5'
                            )}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={20} />
                                <div>
                                  <p className={cn(
                                    'font-medium text-sm',
                                    player.is_eliminated && 'line-through text-muted-foreground'
                                  )}>
                                    {player.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground sm:hidden">
                                    {player.team_name}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
                              {player.team_name}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{player.total_points}</TableCell>
                            <TableCell className="text-right hidden sm:table-cell">
                              {player.is_eliminated ? (
                                <Badge variant="destructive" className="text-[10px]">Eliminated</Badge>
                              ) : (
                                <Badge variant="success" className="text-[10px]">Active</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* Navigation cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {NAV_CARDS.map(({ label, description, path, icon: Icon }) => (
          <Link key={path} to={`/leagues/${id}/${path}`}>
            <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <Icon className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground hidden sm:block">{description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* My Roster (pre-dashboard fallback for when draft is done but no standings row for user) */}
      {draftDone && !myRow && myMemberId && myRoster.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">My Roster</h2>
            <Link
              to={`/leagues/${id}/team/${myMemberId}`}
              className="text-sm text-primary hover:underline"
            >
              View Full Roster
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>Player</TableHead>
                      <TableHead>College Team</TableHead>
                      <TableHead>Pos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {ROUNDS.map((r) => (
                        <TableHead key={r} className="text-right text-xs">
                          {r}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myRoster.map((player) => (
                      <PlayerRow key={player.player_id} player={player} />
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      {/* Members */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Members</h2>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {league.members?.map((m) => {
                const memberStanding = standings.find((s) => s.member_id === m.id);
                const inner = (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                          {m.username?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium text-sm">{m.username}</span>
                        {draftDone && memberStanding && (
                          <p className="text-xs text-muted-foreground">
                            {memberStanding.total_score} pts · {memberStanding.active_players} active
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.is_bot && (
                        <Badge variant="secondary" className="text-xs">CPU</Badge>
                      )}
                      {m.user_id === league.commissioner_id && (
                        <Badge variant="warning" className="text-xs">Commissioner</Badge>
                      )}
                      {isCommissioner && league.draft_status === 'pre_draft' && m.user_id !== league.commissioner_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRemoveDialog(m); }}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );

                return draftDone ? (
                  <li key={m.id}>
                    <Link
                      to={`/leagues/${id}/team/${m.id}`}
                      className="px-4 py-3 flex hover:bg-muted/50 transition-colors"
                    >
                      {inner}
                    </Link>
                  </li>
                ) : (
                  <li key={m.id} className="px-4 py-3 flex items-center justify-between">
                    {inner}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
      {/* Leave league confirmation dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave League</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave {league.name}? You can rejoin later with the invite code.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleLeaveLeague}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member confirmation dialog */}
      <Dialog open={!!showRemoveDialog} onOpenChange={(open) => !open && setShowRemoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Remove {showRemoveDialog?.username} from {league.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveMember}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit league settings dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit League Settings</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditLeague} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">League Name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-team-count">Team Count (4-20)</Label>
              <Input id="edit-team-count" type="number" min={4} max={20} value={editTeamCount} onChange={(e) => setEditTeamCount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-roster-size">Roster Size</Label>
              <Input id="edit-roster-size" type="number" min={1} value={editRosterSize} onChange={(e) => setEditRosterSize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-draft-timer">Draft Timer (seconds per pick)</Label>
              <Input id="edit-draft-timer" type="number" min={15} max={300} value={editDraftTimer} onChange={(e) => setEditDraftTimer(e.target.value)} />
              <p className="text-xs text-muted-foreground">Players will be auto-picked when the timer expires (15-300s)</p>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
