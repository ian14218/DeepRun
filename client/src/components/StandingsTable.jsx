import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const RANK_COLORS = ['text-yellow-400', 'text-gray-400', 'text-amber-600'];

export default function StandingsTable({ standings, leagueId }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!standings || standings.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm italic">
          No standings yet.
        </CardContent>
      </Card>
    );
  }

  function handleRowClick(memberId) {
    if (leagueId) {
      navigate(`/leagues/${leagueId}/team/${memberId}`);
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Active</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Eliminated</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((row, i) => {
                const isCurrentUser = row.user_id === user?.id;
                return (
                  <TableRow
                    key={row.member_id}
                    className={cn(
                      'border-border transition-colors',
                      isCurrentUser && 'bg-primary/5',
                      leagueId && 'cursor-pointer hover:bg-muted/50'
                    )}
                    onClick={() => handleRowClick(row.member_id)}
                  >
                    <TableCell className={cn(
                      'text-center font-bold',
                      RANK_COLORS[i] || 'text-muted-foreground'
                    )}>
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>
                        {row.team_name || row.username}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-xs text-primary">(You)</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {row.active_players} active · {row.eliminated_players} elim
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{row.total_score}</TableCell>
                    <TableCell className="text-right text-success hidden sm:table-cell">{row.active_players}</TableCell>
                    <TableCell className="text-right text-destructive hidden sm:table-cell">{row.eliminated_players}</TableCell>
                    <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{row.players_remaining}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
