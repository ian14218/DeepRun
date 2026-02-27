import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PriceTag from './PriceTag';
import BudgetBar from './BudgetBar';
import TeamLogo from '@/components/TeamLogo';

export default function RosterPanel({ entry, roster, rosterSize, totalBudget, onRemove, onSubmit, readOnly }) {
  const slots = Array.from({ length: rosterSize }, (_, i) => roster[i] || null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">My Roster</CardTitle>
        <BudgetBar
          budgetRemaining={entry?.budget_remaining ?? totalBudget}
          totalBudget={totalBudget}
        />
        <p className="text-xs text-muted-foreground">
          {roster.length} / {rosterSize} players
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {slots.map((player, i) => (
          <div
            key={player ? player.player_id : `empty-${i}`}
            className={`flex items-center justify-between p-2 rounded border ${
              player ? 'border-border bg-card' : 'border-dashed border-muted-foreground/30 bg-muted/20'
            }`}
          >
            {player ? (
              <>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={20} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{player.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {player.team_name} · {player.seed}-seed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <PriceTag price={player.purchase_price} className="text-sm" />
                  {!readOnly && onRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(player.player_id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground italic">Empty slot</span>
            )}
          </div>
        ))}
        {!readOnly && roster.length >= rosterSize && onSubmit && (
          <Button className="w-full mt-3" size="lg" onClick={onSubmit}>
            <Check className="h-4 w-4 mr-2" />
            Submit Lineup
          </Button>
        )}
        {!readOnly && roster.length < rosterSize && (
          <p className="text-xs text-center text-muted-foreground mt-2">
            Add {rosterSize - roster.length} more player{rosterSize - roster.length !== 1 ? 's' : ''} to submit
          </p>
        )}
      </CardContent>
    </Card>
  );
}
