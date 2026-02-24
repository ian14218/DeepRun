import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Users, Swords, Tv, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Standings', path: 'standings', icon: BarChart3 },
  { label: 'My Team', path: 'my-team', icon: Users },
  { label: 'Draft', path: 'draft', icon: Swords },
  { label: 'Scoreboard', path: 'scoreboard', icon: Tv },
  { label: 'Bracket', path: 'bracket', icon: Trophy },
];

export default function LeagueSidebar({ leagueId, mobile = false }) {
  const location = useLocation();
  const base = `/leagues/${leagueId}`;

  if (mobile) {
    return (
      <nav className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {navItems.map(({ label, path, icon: Icon }) => {
          const to = `${base}/${path}`;
          const active = location.pathname === to;
          return (
            <Link
              key={path}
              to={to}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1 w-48 shrink-0 sticky top-20">
      <div className="bg-card rounded-lg border border-border p-2">
        {navItems.map(({ label, path, icon: Icon }) => {
          const to = `${base}/${path}`;
          const active = location.pathname === to;
          return (
            <Link
              key={path}
              to={to}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
