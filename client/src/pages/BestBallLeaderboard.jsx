import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getActiveContest, getLeaderboard } from '@/services/bestBallService';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

export default function BestBallLeaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  useEffect(() => {
    async function load() {
      try {
        const c = await getActiveContest();
        if (!c) return;
        setContest(c);
        const lb = await getLeaderboard(c.id, { page, limit });
        setEntries(lb.rows);
        setTotal(lb.total);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page]);

  const totalPages = Math.ceil(total / limit);

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No active contest
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/best-ball')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">{contest.name}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No complete entries yet
        </p>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">Rank</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Active</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Eliminated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => {
                  const rank = (page - 1) * limit + idx + 1;
                  const isCurrentUser = entry.user_id === user?.id;

                  return (
                    <TableRow
                      key={entry.id}
                      className={isCurrentUser ? 'bg-primary/5' : 'cursor-pointer hover:bg-muted/50'}
                      onClick={() => navigate(`/best-ball/users/${entry.user_id}`)}
                    >
                      <TableCell className="text-center font-mono font-bold">
                        {rank}
                      </TableCell>
                      <TableCell>
                        <span className={isCurrentUser ? 'font-bold text-primary' : ''}>
                          {entry.username}
                          {isCurrentUser && ' (You)'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold">
                        {entry.total_score}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell text-emerald-400">
                        {entry.active_players}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell text-muted-foreground">
                        {entry.eliminated_players}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{total} entries</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">{page} / {totalPages}</span>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
