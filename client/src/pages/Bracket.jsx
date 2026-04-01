import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLeague } from '../services/leagueService';
import { getTournamentTeams, getTeamRoster, getBracketLayout } from '../services/standingsService';
import { Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import BracketView from '../components/BracketView';

export default function Bracket() {
  const { id: leagueId } = useParams();
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [draftedCountByTeam, setDraftedCountByTeam] = useState({});
  const [bracketLayout, setBracketLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [teamsData, league, layout] = await Promise.all([
          getTournamentTeams(),
          getLeague(leagueId),
          getBracketLayout().catch(() => null),
        ]);

        setTeams(teamsData);
        if (layout) setBracketLayout(layout);

        // Build drafted-player-count map if draft is completed
        if (league.draft_status === 'completed') {
          const myMember = league.members?.find((m) => m.user_id === user?.id);
          if (myMember) {
            const roster = await getTeamRoster(leagueId, myMember.id);
            const counts = {};
            roster.forEach((p) => {
              if (p.team_external_id) {
                counts[p.team_external_id] = (counts[p.team_external_id] || 0) + 1;
              }
            });
            setDraftedCountByTeam(counts);
          }
        }
      } catch {
        setError('Failed to load bracket data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId, user?.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/leagues/${leagueId}`} className="text-primary hover:underline text-sm">
          ← Back to League
        </Link>
        <h1 className="text-3xl font-bold">Tournament Bracket</h1>
      </div>

      {error && <p className="text-destructive mb-4">{error}</p>}

      {teams.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No tournament teams seeded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <BracketView teams={teams} draftedCountByTeam={draftedCountByTeam} bracketLayout={bracketLayout} />
      )}
    </div>
  );
}
