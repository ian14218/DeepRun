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

export default function PlayerRow({ player }) {
  const eliminated = player.is_eliminated;

  return (
    <TableRow className={cn(
      'border-border transition-colors',
      eliminated ? 'bg-destructive/5' : 'border-l-2 border-l-success/40'
    )}>
      <TableCell className="font-medium">
        <span className={cn(eliminated && 'line-through text-muted-foreground')}>
          {player.name}
        </span>
        {eliminated && (
          <Badge
            data-testid={`elim-badge-${player.player_id}`}
            variant="destructive"
            className="ml-2 text-[10px]"
          >
            Eliminated
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={18} />
          {player.team_name}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{player.position}</TableCell>
      <TableCell className="text-right font-semibold">{player.total_points}</TableCell>
      {ROUNDS.map((round) => {
        const pts = player.points_by_round?.[round] ?? 0;
        return (
          <TableCell
            key={round}
            data-testid={`round-${player.player_id}-${round}`}
            className={cn(
              'text-right',
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
