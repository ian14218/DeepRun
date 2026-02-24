import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Trophy, Swords } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const NAV_ITEMS = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/leagues', icon: Trophy, label: 'Leagues' },
  { to: '/admin/tournament', icon: Swords, label: 'Tournament' },
];

export default function AdminLayout() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-border bg-sidebar p-4 gap-1">
        <div className="flex items-center gap-2 mb-4 px-2">
          <Badge variant="destructive" className="text-xs font-semibold">Admin</Badge>
          <span className="text-sm font-medium text-muted-foreground">Panel</span>
        </div>
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden flex items-center gap-1 border-b border-border bg-sidebar px-4 py-2 overflow-x-auto fixed top-14 left-0 right-0 z-40">
        <Badge variant="destructive" className="text-xs font-semibold shrink-0">Admin</Badge>
        {NAV_ITEMS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 p-6 md:p-8 mt-10 md:mt-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
