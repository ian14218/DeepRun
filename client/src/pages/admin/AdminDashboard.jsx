import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Trophy, Swords, Dribbble, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminStats } from '../../services/adminService';

const STAT_CARDS = [
  { key: 'userCount', label: 'Total Users', icon: Users, color: 'text-primary', link: '/admin/users' },
  { key: 'leagueCount', label: 'Total Leagues', icon: Trophy, color: 'text-accent', link: '/admin/leagues' },
  { key: 'activeDrafts', label: 'Active Drafts', icon: Activity, color: 'text-green-400', link: '/admin/leagues' },
  { key: 'teamCount', label: 'Tournament Teams', icon: Swords, color: 'text-yellow-400', link: '/admin/tournament' },
  { key: 'playerCount', label: 'Players', icon: Dribbble, color: 'text-purple-400', link: '/admin/tournament' },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {STAT_CARDS.map(({ key, label, icon: Icon, color, link }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold">{stats?.[key] ?? 0}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3">Quick Links</h2>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/users">Manage Users</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/leagues">Manage Leagues</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/tournament">View Tournament</Link>
        </Button>
      </div>
    </div>
  );
}
