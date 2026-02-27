import { cn } from '@/lib/utils';

export default function BudgetBar({ budgetRemaining, totalBudget }) {
  const pct = totalBudget > 0 ? (budgetRemaining / totalBudget) * 100 : 0;

  let barColor = 'bg-emerald-500';
  if (pct < 20) barColor = 'bg-red-500';
  else if (pct < 40) barColor = 'bg-amber-500';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Budget Remaining</span>
        <span className="font-mono font-semibold text-foreground">
          ${budgetRemaining.toLocaleString()} / ${totalBudget.toLocaleString()}
        </span>
      </div>
      <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
