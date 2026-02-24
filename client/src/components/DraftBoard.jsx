import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import TeamLogo from './TeamLogo';

export default function DraftBoard({ picks, teamCount = 0, rosterSize = 0, currentUserId }) {
  if (picks.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No picks yet.
        </CardContent>
      </Card>
    );
  }

  const positionToUsername = {};
  const positionToUserId = {};
  for (const pick of picks) {
    if (!positionToUsername[pick.draft_position]) {
      positionToUsername[pick.draft_position] = pick.username;
      positionToUserId[pick.draft_position] = pick.user_id;
    }
  }

  const pickMap = {};
  for (const pick of picks) {
    pickMap[`${pick.round}-${pick.draft_position}`] = pick;
  }

  const positions =
    teamCount > 0
      ? Array.from({ length: teamCount }, (_, i) => i + 1)
      : [...new Set(picks.map((p) => p.draft_position))].sort((a, b) => a - b);

  const rounds =
    rosterSize > 0
      ? Array.from({ length: rosterSize }, (_, i) => i + 1)
      : [...new Set(picks.map((p) => p.round))].sort((a, b) => a - b);

  const latestPick = picks[picks.length - 1];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Draft Board</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-16 text-center text-xs">Rd</TableHead>
                {positions.map((pos) => (
                  <TableHead
                    key={pos}
                    className={cn(
                      'text-xs text-center min-w-[100px]',
                      positionToUserId[pos] === currentUserId && 'text-primary'
                    )}
                  >
                    {positionToUsername[pos] || `Team ${pos}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rounds.map((round) => (
                <TableRow key={round} className="border-border">
                  <TableCell className="text-center text-xs font-medium text-muted-foreground">
                    {round}
                  </TableCell>
                  {positions.map((pos) => {
                    const pick = pickMap[`${round}-${pos}`];
                    const isLatest =
                      latestPick &&
                      latestPick.round === round &&
                      latestPick.draft_position === pos;
                    const isMyPick = pick?.user_id === currentUserId;

                    return (
                      <TableCell
                        key={pos}
                        className={cn(
                          'text-center p-1.5 transition-colors',
                          pick
                            ? isMyPick
                              ? 'bg-primary/10'
                              : ''
                            : '',
                          isLatest && 'ring-2 ring-accent ring-inset animate-pulse'
                        )}
                      >
                        {pick ? (
                          <div className="text-xs leading-tight">
                            <div className="font-medium truncate">{pick.player_name}</div>
                            <div className="text-muted-foreground truncate flex items-center justify-center gap-1">
                              <TeamLogo externalId={pick.team_external_id} teamName={pick.team_name} size={14} />
                              {pick.team_name} ({pick.position})
                            </div>
                          </div>
                        ) : (
                          <div className="h-8 border border-dashed border-border/50 rounded" />
                        )}
                      </TableCell>
                    );
                  })}
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
