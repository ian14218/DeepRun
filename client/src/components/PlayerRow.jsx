import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import TeamLogo from './TeamLogo';

const ROUNDS = [
  'Round of 64',
  'Round of 32',
  'Sweet 16',
  'Elite 8',
  'Final Four',
  'Championship',
];

export default function PlayerRow({ player, showRounds = false, isMrIrrelevant = false }) {
  const eliminated = player.is_eliminated;

  return (
    <TableRow className={cn(
      'border-border transition-colors',
      eliminated ? 'bg-destructive/5' : 'border-l-2 border-l-success/40'
    )}>
      <TableCell className="font-medium">
        <div>
          <span className={cn(eliminated && 'line-through text-muted-foreground')}>
            {player.name}
          </span>
          {isMrIrrelevant && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] border-purple-500 text-purple-500"
            >
              Mr. Irrelevant
            </Badge>
          )}
          {eliminated && (
            <Badge
              data-testid={`elim-badge-${player.player_id}`}
              variant="destructive"
              className="ml-2 text-[10px]"
            >
              Eliminated
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground sm:hidden flex items-center gap-1 mt-0.5">
          <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={14} />
          {player.team_name} · {player.position}
        </p>
      </TableCell>
      <TableCell className="text-muted-foreground hidden sm:table-cell">
        <span className="flex items-center gap-1.5">
          <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={18} />
          {player.team_name}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground hidden sm:table-cell">{player.position}</TableCell>
      <TableCell className="text-right font-semibold">{player.total_points}</TableCell>
      {ROUNDS.map((round) => {
        const primary = player.points_by_round?.[round] ?? 0;
        const paired = player.paired_points_by_round?.[round] ?? 0;
        const pts = primary + paired;
        return (
          <TableCell
            key={round}
            data-testid={`round-${player.player_id}-${round}`}
            className={cn(
              'text-right',
              !showRounds && 'hidden md:table-cell',
              pts === 0 ? 'text-muted-foreground/40' : 'text-foreground'
            )}
          >
            {pts}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
