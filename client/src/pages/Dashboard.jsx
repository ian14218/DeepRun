import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { getLeagues } from '../services/leagueService';
import { getActiveContest, getMyLineup } from '../services/bestBallService';
import { Plus, UserPlus, Trophy, Users, DollarSign, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_CONFIG = {
  pre_draft: { label: 'Pre-Draft', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'success' },
  completed: { label: 'Completed', variant: 'outline' },
};

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bbContest, setBbContest] = useState(null);
  const [bbEntry, setBbEntry] = useState(null);

  useEffect(() => {
    getLeagues()
      .then(setLeagues)
      .finally(() => setLoading(false));
    getActiveContest()
      .then((c) => {
        setBbContest(c);
        if (c) return getMyLineup(c.id);
      })
      .then((entry) => { if (entry) setBbEntry(entry); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Your Leagues</h1>
        <div className="flex gap-2">
          <Button size="sm" asChild className="sm:size-default">
            <Link to="/leagues/create">
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span>Create</span>
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild className="sm:size-default">
            <Link to="/leagues/join">
              <UserPlus className="h-4 w-4 sm:mr-1.5" />
              <span>Join</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Best Ball section */}
      <Link to="/best-ball">
        <Card className="mb-8 hover:border-emerald-500/40 transition-colors border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-semibold">Best Ball</h2>
                {bbContest && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                    {bbContest.status}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {bbEntry
                  ? `${bbEntry.roster?.length || 0}/${bbContest.roster_size} players · $${bbEntry.budget_remaining?.toLocaleString()} remaining`
                  : bbContest
                    ? `$${bbContest.budget.toLocaleString()} budget · ${bbContest.roster_size} players · Compete against everyone`
                    : 'Build an 8-player lineup with a $8,000 salary cap and compete against everyone'
                }
              </p>
            </div>
            <div className="shrink-0">
              {bbEntry ? (
                <Button size="sm" variant="outline">
                  {bbContest.status === 'open' ? 'Edit Lineup' : 'View'}
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              ) : bbContest?.status === 'open' ? (
                <Button size="sm">
                  Enter
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              ) : (
                <Button size="sm" variant="outline">
                  View
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-6 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && leagues.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No leagues yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Create a new league or join one with an invite code.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/leagues/create">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create League
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/leagues/join">
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Join League
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* League cards grid */}
      {!loading && leagues.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {leagues.map((league) => {
            const status = STATUS_CONFIG[league.draft_status] || {
              label: league.draft_status,
              variant: 'secondary',
            };
            return (
              <Link key={league.id} to={`/leagues/${league.id}`}>
                <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-semibold leading-tight">{league.name}</h2>
                      <Badge variant={status.variant} className="shrink-0">
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{league.member_count ?? '?'} / {league.team_count} members</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
