import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLeagues } from '../services/leagueService';
import { Menu, LogOut, ChevronDown, Trophy, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (user) {
      getLeagues().then(setLeagues).catch(() => {});
    } else {
      setLeagues([]);
    }
  }, [user]);

  if (!user) return null;

  const initials = user.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  return (
    <nav className="sticky top-0 z-50 h-14 bg-card/95 backdrop-blur border-b border-border supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
          <Trophy className="h-5 w-5 text-accent" />
          <span className="text-lg font-bold tracking-tight">
            <span className="text-accent">MM</span>
            <span className="text-foreground">Fantasy</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-3">
          {/* League switcher */}
          {leagues.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  My Leagues
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {leagues.map((l) => (
                  <DropdownMenuItem key={l.id} onClick={() => navigate(`/leagues/${l.id}`)}>
                    {l.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Admin link */}
          {user.is_admin && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => navigate('/admin')}>
              <Shield className="h-3.5 w-3.5" />
              Admin
            </Button>
          )}

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground">{user.username}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="text-muted-foreground text-xs cursor-default" disabled>
                {user.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card/95 backdrop-blur px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{user.username}</span>
          </div>
          {leagues.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Leagues
              </div>
              {leagues.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    navigate(`/leagues/${l.id}`);
                    setMobileOpen(false);
                  }}
                  className="block w-full text-left px-2 py-1.5 text-sm rounded hover:bg-secondary transition-colors"
                >
                  {l.name}
                </button>
              ))}
            </>
          )}
          {user.is_admin && (
            <button
              onClick={() => {
                navigate('/admin');
                setMobileOpen(false);
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-destructive rounded hover:bg-destructive/10 transition-colors"
            >
              <Shield className="h-4 w-4" />
              Admin Panel
            </button>
          )}
          <div className="border-t border-border pt-2">
            <button
              onClick={() => {
                logout();
                setMobileOpen(false);
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-destructive rounded hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
