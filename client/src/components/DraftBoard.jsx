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
import { ChevronRight, ChevronLeft } from 'lucide-react';
import TeamLogo from './TeamLogo';

export default function DraftBoard({
  picks,
  teamCount = 0,
  rosterSize = 0,
  currentUserId,
  members = [],
  currentTurn,
}) {
  if (teamCount <= 0 || rosterSize <= 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Draft board unavailable.
        </CardContent>
      </Card>
    );
  }

  // Build position → member info from members array
  const membersByPosition = {};
  for (const m of members) {
    if (m.draft_position) {
      membersByPosition[m.draft_position] = m;
    }
  }

  const pickMap = {};
  for (const pick of picks) {
    pickMap[`${pick.round}-${pick.draft_position}`] = pick;
  }

  const positions = Array.from({ length: teamCount }, (_, i) => i + 1);
  const rounds = Array.from({ length: rosterSize }, (_, i) => i + 1);

  const latestPick = picks.length > 0 ? picks[picks.length - 1] : null;

  // Derive on-the-clock cell from currentTurn
  let clockCol = null;
  let clockRow = null;
  if (currentTurn) {
    clockCol = currentTurn.draft_position;
    clockRow = Math.ceil(currentTurn.pick_number / teamCount);
  }

  // Find current user's draft position
  const myPosition = members.find((m) => m.user_id === currentUserId)?.draft_position;

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
                <TableHead className="w-12 text-center text-xs sticky left-0 z-10 bg-card">
                  Rd
                </TableHead>
                {positions.map((pos) => {
                  const member = membersByPosition[pos];
                  const isMe = member?.user_id === currentUserId;
                  return (
                    <TableHead
                      key={pos}
                      className={cn(
                        'text-xs text-center min-w-[90px]',
                        isMe && 'text-primary font-bold'
                      )}
                    >
                      {member?.team_name || member?.username || `Team ${pos}`}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rounds.map((round) => {
                const isReverse = round % 2 === 0;
                return (
                  <TableRow key={round} className="border-border">
                    <TableCell className="text-center text-xs font-medium text-muted-foreground sticky left-0 z-10 bg-card">
                      <span className="inline-flex items-center gap-0.5">
                        {isReverse ? (
                          <ChevronLeft className="h-3 w-3 text-muted-foreground/60" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                        )}
                        {round}
                      </span>
                    </TableCell>
                    {positions.map((pos) => {
                      const pick = pickMap[`${round}-${pos}`];
                      const isLatest =
                        latestPick &&
                        latestPick.round === round &&
                        latestPick.draft_position === pos;
                      const isMyPick = pick?.user_id === currentUserId;
                      const isMyColumn = pos === myPosition;
                      const isClock = clockRow === round && clockCol === pos;

                      return (
                        <TableCell
                          key={pos}
                          className={cn(
                            'text-center p-1.5 transition-colors',
                            isMyColumn && 'bg-primary/5',
                            pick && isMyPick && 'bg-primary/10',
                            isLatest && 'ring-2 ring-accent ring-inset',
                            isClock && !pick && 'ring-2 ring-accent ring-inset'
                          )}
                        >
                          {pick ? (
                            <div className="text-xs leading-tight">
                              <div className="font-medium truncate">
                                {pick.player_name}
                                {pick.paired_player_name && (
                                  <span className="text-muted-foreground font-normal">
                                    {' '}
                                    / {pick.paired_player_name}
                                  </span>
                                )}
                              </div>
                              <div className="text-muted-foreground truncate flex items-center justify-center gap-1">
                                <TeamLogo
                                  externalId={pick.team_external_id}
                                  teamName={pick.team_name}
                                  size={14}
                                />
                                {pick.team_name}
                                {pick.paired_team_name && (
                                  <>
                                    <span>/</span>
                                    <TeamLogo
                                      externalId={pick.paired_team_external_id}
                                      teamName={pick.paired_team_name}
                                      size={14}
                                    />
                                    {pick.paired_team_name}
                                  </>
                                )}
                                <span>({pick.position})</span>
                              </div>
                            </div>
                          ) : isClock ? (
                            <div className="h-8 flex items-center justify-center gap-1.5">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                              </span>
                              <span className="text-[10px] text-accent font-medium truncate">
                                {membersByPosition[pos]?.username || `Team ${pos}`}
                              </span>
                            </div>
                          ) : (
                            <div className="h-8 border border-dashed border-border/50 rounded" />
                          )}
                        </TableCell>
                      );
                    })}
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
