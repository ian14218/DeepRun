import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import TeamLogo from './TeamLogo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const RANK_COLORS = ['text-purple-400', 'text-gray-400', 'text-amber-600'];

export default function MrIrrelevantTracker({ entries }) {
  if (!entries || entries.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Last Pick</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Pick #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, i) => (
                <TableRow key={entry.member_id} className="border-border">
                  <TableCell className={cn(
                    'text-center font-bold',
                    RANK_COLORS[i] || 'text-muted-foreground'
                  )}>
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.team_name || entry.username}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <TeamLogo externalId={entry.team_external_id} teamName={entry.team_name_college} size={18} />
                      <span className={cn(entry.is_eliminated && 'line-through text-muted-foreground')}>
                        {entry.player_name}
                      </span>
                      <Badge variant="outline" className="text-[10px] border-purple-500 text-purple-500 ml-1">
                        Mr. Irrelevant
                      </Badge>
                      {entry.is_eliminated && (
                        <Badge variant="destructive" className="text-[10px]">Elim</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.team_name_college} · {entry.position} · #{entry.seed} seed
                    </p>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{entry.total_points}</TableCell>
                  <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                    {entry.pick_number}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
