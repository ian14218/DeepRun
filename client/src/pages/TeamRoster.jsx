import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLeague } from '../services/leagueService';
import { getTeamRoster } from '../services/standingsService';
import PlayerRow from '../components/PlayerRow';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ROUNDS = [
  'Round of 64',
  'Round of 32',
  'Sweet 16',
  'Elite 8',
  'Final Four',
  'Championship',
];

export default function TeamRoster() {
  const { id: leagueId, memberId } = useParams();
  const { user } = useAuth();
  const [roster, setRoster] = useState([]);
  const [memberName, setMemberName] = useState('');
  const [isCurrentUser, setIsCurrentUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const league = await getLeague(leagueId);
        const member = league.members.find((m) => m.id === memberId);
        if (!member) throw new Error('Member not found in this league.');
        setMemberName(member.username);
        setIsCurrentUser(member.user_id === user.id);
        const data = await getTeamRoster(leagueId, memberId);
        const sorted = [
          ...data.filter((p) => !p.is_eliminated),
          ...data.filter((p) => p.is_eliminated),
        ];
        setRoster(sorted);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId, memberId, user.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-destructive">{error}</p>;

  const active = roster.filter((p) => !p.is_eliminated);
  const total = roster.length;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Link to={`/leagues/${leagueId}`} className="text-primary hover:underline text-sm">
          ← Back to League
        </Link>
        <h1 className="text-3xl font-bold">
          {isCurrentUser ? 'My Team' : `Team: ${memberName}`}
          {isCurrentUser && (
            <span className="ml-2 text-sm font-normal text-primary">(You)</span>
          )}
        </h1>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4">
        <Badge variant={active.length > 0 ? 'success' : 'destructive'}>
          {active.length} of {total} alive
        </Badge>
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all"
            style={{ width: total > 0 ? `${(active.length / total) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {roster.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No players on this roster yet.
          </CardContent>
        </Card>
      ) : (
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
                  {roster.map((player) => (
                    <PlayerRow key={player.player_id} player={player} />
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
