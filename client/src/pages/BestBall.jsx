import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getActiveContest, getMyLineup, getEntryDetail, enterContest, getLeaderboard } from '@/services/bestBallService';
import { getTournamentTeams } from '@/services/standingsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import BudgetBar from '@/components/bestball/BudgetBar';
import PriceTag from '@/components/bestball/PriceTag';
import TeamLogo from '@/components/TeamLogo';
import BracketView from '@/components/BracketView';
import { Trophy, Clock, Users, ChevronRight, BarChart3, GitBranch } from 'lucide-react';

function formatCountdown(lockDate) {
  const diff = new Date(lockDate) - new Date();
  if (diff <= 0) return 'Locked';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  if (days > 0) return `${days}d ${hours}h until lock`;
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  return `${hours}h ${mins}m until lock`;
}

const statusColors = {
  upcoming: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  open: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  locked: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  live: 'bg-red-500/10 text-red-400 border-red-500/30',
  completed: 'bg-muted text-muted-foreground border-muted',
};

const statusLabels = {
  upcoming: 'Upcoming',
  open: 'Open',
  locked: 'Locked',
  live: 'Live',
  completed: 'Completed',
};

export default function BestBall() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [entry, setEntry] = useState(null);
  const [entryDetail, setEntryDetail] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [winner, setWinner] = useState(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('roster');

  const isLive = contest && ['locked', 'live', 'completed'].includes(contest.status);

  useEffect(() => {
    async function load() {
      try {
        const c = await getActiveContest();
        setContest(c);
        if (c) {
          const lineup = await getMyLineup(c.id);
          setEntry(lineup);
          // If tournament is underway and user has an entry, load detailed stats + bracket data
          if (lineup && ['locked', 'live', 'completed'].includes(c.status)) {
            const fetches = [
              getEntryDetail(lineup.id),
              getTournamentTeams(),
            ];
            // Fetch the #1 entry when contest is completed
            if (c.status === 'completed') {
              fetches.push(getLeaderboard(c.id, { page: 1, limit: 1 }));
            }
            const [detail, teamsData, leaderboard] = await Promise.all(fetches);
            setEntryDetail(detail);
            setTeams(teamsData);
            if (leaderboard?.rows?.[0]) {
              setWinner(leaderboard.rows[0]);
            }
          } else if (c.status === 'completed') {
            // User has no entry but contest is done — still show the winner
            const lb = await getLeaderboard(c.id, { page: 1, limit: 1 });
            if (lb?.rows?.[0]) setWinner(lb.rows[0]);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleEnter = async () => {
    if (!contest) return;
    setEntering(true);
    try {
      await enterContest(contest.id);
      navigate('/best-ball/lineup');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to enter');
    } finally {
      setEntering(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center space-y-4">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-bold">Best Ball</h1>
        <p className="text-muted-foreground">No active contest right now. Check back soon!</p>
      </div>
    );
  }

  // ─── Live / Locked / Completed view ──────────────────────────────────────
  if (isLive && entry && entryDetail) {
    const activeCount = entryDetail.roster?.filter((p) => {
      if (p.paired_player_name) return !p.is_eliminated || !p.paired_is_eliminated;
      return !p.is_eliminated;
    }).length || 0;
    const elimCount = entryDetail.roster?.filter((p) => {
      if (p.paired_player_name) return p.is_eliminated && p.paired_is_eliminated;
      return p.is_eliminated;
    }).length || 0;

    // Build draftedCountByTeam for bracket highlighting
    const draftedCountByTeam = {};
    entryDetail.roster?.forEach((p) => {
      if (p.team_external_id) {
        draftedCountByTeam[p.team_external_id] = (draftedCountByTeam[p.team_external_id] || 0) + 1;
      }
    });

    return (
      <div className="p-4 sm:p-6 space-y-6" style={{ maxWidth: tab === 'bracket' ? 'none' : '48rem', margin: '0 auto' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{contest.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline" className={statusColors[contest.status]}>
                {statusLabels[contest.status]}
              </Badge>
            </div>
          </div>
        </div>

        {/* Champion Banner (completed contest) */}
        {contest.status === 'completed' && winner && (
          <Card className="overflow-hidden border-2 border-yellow-500/50 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-yellow-500/10">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="rounded-full p-3 bg-yellow-500/20">
                  <Trophy className="h-7 w-7 text-yellow-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-yellow-500">
                    Contest Champion
                  </p>
                  <p className="text-xl font-bold truncate">
                    {winner.username}
                    {winner.user_id === user?.id && (
                      <span className="text-sm font-normal text-muted-foreground ml-2">(You!)</span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold">{winner.total_score}</p>
                  <p className="text-xs text-muted-foreground">points</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score + Rank summary */}
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold">{entryDetail.total_score || 0}</p>
                <p className="text-xs text-muted-foreground">Total Points</p>
              </div>
              <div>
                <p className="text-3xl font-bold">#{entryDetail.rank || '—'}</p>
                <p className="text-xs text-muted-foreground">Rank</p>
              </div>
              <div>
                <p className="text-3xl font-bold">
                  <span className="text-emerald-400">{activeCount}</span>
                  <span className="text-muted-foreground text-lg"> / </span>
                  <span className="text-red-400">{elimCount}</span>
                </p>
                <p className="text-xs text-muted-foreground">Active / Eliminated</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab toggle */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <Button
            variant={tab === 'roster' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('roster')}
          >
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Roster
          </Button>
          <Button
            variant={tab === 'bracket' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('bracket')}
          >
            <GitBranch className="h-4 w-4 mr-1.5" />
            Bracket
          </Button>
        </div>

        {/* Tab content */}
        {tab === 'roster' ? (
          <>
            {/* Roster with points */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Your Roster</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {entryDetail.roster
                  ?.sort((a, b) => b.total_points - a.total_points)
                  .map((player) => (
                    <div
                      key={player.player_id}
                      className={`flex items-center justify-between p-2.5 rounded border ${
                        player.is_eliminated && (!player.paired_player_name || player.paired_is_eliminated)
                          ? 'border-red-500/20 bg-red-500/5 opacity-60'
                          : 'border-border bg-card'
                      }`}
                    >
                      {player.paired_player_name ? (() => {
                        const primaryOut = player.is_eliminated;
                        const pairedOut = player.paired_is_eliminated;
                        const showPaired = primaryOut && !pairedOut;
                        const activeName = showPaired ? player.paired_player_name : player.name;
                        const activeTeamName = showPaired ? player.paired_team_name : player.team_name;
                        const activeTeamExtId = showPaired ? player.paired_team_external_id : player.team_external_id;
                        const settled = primaryOut || pairedOut;
                        const bothOut = primaryOut && pairedOut;

                        return (
                          <>
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <TeamLogo externalId={activeTeamExtId} teamName={activeTeamName} size={22} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {activeName}
                                  {bothOut && <span className="text-xs text-red-400 ml-1.5">ELIM</span>}
                                </p>
                                {settled ? (
                                  <p className="text-xs text-muted-foreground">
                                    {activeTeamName} · {player.seed}-seed · <PriceTag price={player.purchase_price} className="text-xs inline" />
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    {player.name} vs {player.paired_player_name} · <span className="text-amber-600">First Four</span> · <PriceTag price={player.purchase_price} className="text-xs inline" />
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <p className="text-sm font-bold">{player.total_points} pts</p>
                              {player.round_points?.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {player.round_points.map((rp) => rp.points).join(' + ')}
                                </p>
                              )}
                            </div>
                          </>
                        );
                      })() : (
                        <>
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={22} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {player.name}
                                {player.is_eliminated && (
                                  <span className="text-xs text-red-400 ml-1.5">ELIM</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {player.team_name} · {player.seed}-seed · <PriceTag price={player.purchase_price} className="text-xs inline" />
                              </p>
                            </div>
                          </div>
                          <div className="text-right ml-2 shrink-0">
                            <p className="text-sm font-bold">{player.total_points} pts</p>
                            {player.round_points?.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {player.round_points.map((rp) => rp.points).join(' + ')}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/best-ball/leaderboard">
                  <Trophy className="h-4 w-4 mr-2" />
                  Leaderboard
                </Link>
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/best-ball/lineup">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Full Lineup View
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            {teams.length > 0 ? (
              <BracketView teams={teams} draftedCountByTeam={draftedCountByTeam} />
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Trophy className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">No tournament teams seeded yet.</p>
                </CardContent>
              </Card>
            )}

            {/* Leaderboard link under bracket */}
            <Button variant="outline" className="w-full" asChild>
              <Link to="/best-ball/leaderboard">
                <Trophy className="h-4 w-4 mr-2" />
                View Leaderboard
              </Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  // ─── Pre-tournament (open / upcoming) view ────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{contest.name}</h1>
        <div className="flex items-center gap-3 mt-2">
          <Badge variant="outline" className={statusColors[contest.status]}>
            {statusLabels[contest.status]}
          </Badge>
          {contest.status === 'open' && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatCountdown(contest.lock_date)}
            </span>
          )}
        </div>
      </div>

      {/* Champion Banner (completed contest, no entry) */}
      {contest.status === 'completed' && winner && (
        <Card className="overflow-hidden border-2 border-yellow-500/50 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-yellow-500/10">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="rounded-full p-3 bg-yellow-500/20">
                <Trophy className="h-7 w-7 text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-yellow-500">
                  Contest Champion
                </p>
                <p className="text-xl font-bold truncate">{winner.username}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold">{winner.total_score}</p>
                <p className="text-xs text-muted-foreground">points</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Contest info card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">${contest.budget.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Budget</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{contest.roster_size}</p>
              <p className="text-xs text-muted-foreground">Players</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                <Users className="h-5 w-5 inline-block mr-1" />
              </p>
              <p className="text-xs text-muted-foreground">Global Pool</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User lineup status or Enter CTA */}
      {entry ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Lineup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BudgetBar budgetRemaining={entry.budget_remaining} totalBudget={contest.budget} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">
                  {entry.roster?.length || 0} / {contest.roster_size} players
                </p>
                {entry.is_complete ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 mt-1">
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 mt-1">
                    Incomplete
                  </Badge>
                )}
              </div>
              <Button asChild>
                <Link to="/best-ball/lineup">
                  {contest.status === 'open' ? 'Edit Lineup' : 'View Lineup'}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : contest.status === 'open' ? (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-muted-foreground">
              Build an 8-player lineup with a ${contest.budget.toLocaleString()} budget.
              Compete against everyone on the platform!
            </p>
            <Button size="lg" onClick={handleEnter} disabled={entering}>
              {entering ? 'Entering...' : 'Enter Contest'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Leaderboard link */}
      <Button variant="outline" className="w-full" asChild>
        <Link to="/best-ball/leaderboard">
          <Trophy className="h-4 w-4 mr-2" />
          View Leaderboard
        </Link>
      </Button>
    </div>
  );
}
