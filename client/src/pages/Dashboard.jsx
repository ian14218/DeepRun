import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLeagues } from '../services/leagueService';
import { Plus, UserPlus, Trophy, Users } from 'lucide-react';
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
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeagues()
      .then(setLeagues)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Your Leagues</h1>
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
      </div>

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
