import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getActiveContest, getLeaderboard } from '@/services/bestBallService';
import { getEntryDetail } from '@/services/bestBallService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import PriceTag from '@/components/bestball/PriceTag';
import { ArrowLeft } from 'lucide-react';
import api from '@/services/api';

export default function BestBallEntry() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        // Get the active contest, then find this user's entry
        const contest = await getActiveContest();
        if (!contest) {
          setError('No active contest');
          return;
        }
        // Get the user's entry via my-lineup won't work for other users, so
        // we'll search the leaderboard or use a direct approach
        const res = await api.get(`/api/best-ball/contests/${contest.id}/my-lineup`, {
          // We actually need to find the entry by userId, not by the current user
          // The leaderboard gives us entry IDs per user
        });

        // Better approach: get leaderboard and find entry by userId
        const lb = await getLeaderboard(contest.id, { limit: 1000 });
        const userEntry = lb.rows.find((e) => e.user_id === userId);
        if (!userEntry) {
          setError('Entry not found');
          return;
        }

        const detail = await getEntryDetail(userEntry.id);
        setEntry(detail);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load entry');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center space-y-4">
        <p className="text-muted-foreground">{error || 'Entry not found'}</p>
        <Button variant="outline" onClick={() => navigate('/best-ball/leaderboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Leaderboard
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/best-ball/leaderboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{entry.username}'s Lineup</h1>
          {entry.rank && (
            <p className="text-sm text-muted-foreground">
              Rank #{entry.rank} · {entry.total_score} pts
            </p>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{entry.total_score}</p>
            <p className="text-xs text-muted-foreground">Total Points</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">#{entry.rank || '—'}</p>
            <p className="text-xs text-muted-foreground">Rank</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">${entry.budget_remaining?.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Budget Left</p>
          </CardContent>
        </Card>
      </div>

      {/* Roster table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="hidden sm:table-cell">Team</TableHead>
              <TableHead className="text-center">Seed</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-center">Points</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.roster?.map((player) => {
              const hasPair = !!player.paired_player_name;
              const primaryOut = player.is_eliminated;
              const pairedOut = player.paired_is_eliminated;
              const showPaired = hasPair && primaryOut && !pairedOut;
              const settled = hasPair && (primaryOut || pairedOut);
              const bothOut = hasPair && primaryOut && pairedOut;
              const activeName = showPaired ? player.paired_player_name : player.name;
              const activeTeamName = showPaired ? player.paired_team_name : player.team_name;
              const isElim = hasPair ? bothOut : player.is_eliminated;

              return (
                <TableRow key={player.player_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {activeName}
                        {hasPair && !settled && (
                          <span className="text-xs text-muted-foreground font-normal"> / {player.paired_player_name}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground sm:hidden">{activeTeamName}</p>
                      {hasPair && !settled && (
                        <p className="text-xs text-amber-600">First Four</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {activeTeamName}
                  </TableCell>
                  <TableCell className="text-center">{player.seed}</TableCell>
                  <TableCell className="text-right">
                    <PriceTag price={player.purchase_price} />
                  </TableCell>
                  <TableCell className="text-center font-mono font-semibold">
                    {player.total_points}
                  </TableCell>
                  <TableCell className="text-center">
                    {isElim ? (
                      <Badge variant="outline" className="text-red-400 border-red-500/30">Out</Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Points by round */}
      {entry.roster?.some((p) => p.round_points?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Points by Round</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entry.roster
                .filter((p) => p.round_points?.length > 0)
                .map((player) => (
                  <div key={player.player_id} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-36 truncate">{player.name}</span>
                    <div className="flex gap-2 flex-wrap">
                      {player.round_points.map((rp, i) => (
                        <Badge key={i} variant="outline" className="text-xs font-mono">
                          {rp.round}: {rp.points}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
