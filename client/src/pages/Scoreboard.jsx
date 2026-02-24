import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { getLeague } from '../services/leagueService';
import { getScoreboard, getTeamRoster } from '../services/standingsService';
import { Tv } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import TeamLogo from '../components/TeamLogo';

const STATUS_VARIANT = {
  live: 'live',
  final: 'outline',
  upcoming: 'secondary',
};

export default function Scoreboard() {
  useDocumentTitle('Scoreboard');
  const { id: leagueId } = useParams();
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [draftedPlayerIds, setDraftedPlayerIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [gamesData, league] = await Promise.all([
          getScoreboard(leagueId),
          getLeague(leagueId),
        ]);

        const myMember = league.members.find((m) => m.user_id === user.id);
        if (myMember) {
          const roster = await getTeamRoster(leagueId, myMember.id);
          setDraftedPlayerIds(new Set(roster.map((p) => p.player_id)));
        }

        setGames(gamesData);
      } catch {
        setError('Failed to load scoreboard.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId, user.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/leagues/${leagueId}`} className="text-primary hover:underline text-sm">
          ← Back to League
        </Link>
        <h1 className="text-3xl font-bold">Scoreboard</h1>
      </div>

      {error && <p className="text-destructive mb-4">{error}</p>}

      {games.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Tv className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No games today.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {games.map((game) => {
            const myPlayers = (game.players || []).filter((p) =>
              draftedPlayerIds.has(p.player_id)
            );
            const statusKey = game.status?.toLowerCase();
            const variant = STATUS_VARIANT[statusKey] || 'secondary';

            return (
              <Card key={game.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Game header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <TeamLogo externalId={game.home_team_external_id} teamName={game.home_team} size={20} />
                        {game.home_team}
                      </div>
                      <div className="text-xs text-muted-foreground">vs</div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <TeamLogo externalId={game.away_team_external_id} teamName={game.away_team} size={20} />
                        {game.away_team}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold tabular-nums">
                        {game.home_score} – {game.away_score}
                      </div>
                      <Badge variant={variant} className="text-[10px] mt-1">
                        {game.status?.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  {/* Drafted player highlights */}
                  {myPlayers.length > 0 && (
                    <div className="border-t border-border pt-2 mt-2">
                      <p className="text-xs font-semibold text-primary mb-1.5 uppercase tracking-wide">
                        Your Players
                      </p>
                      <div className="space-y-1">
                        {myPlayers.map((player) => (
                          <div
                            key={player.player_id}
                            data-testid={`drafted-player-${player.player_id}`}
                            className="flex justify-between text-sm bg-primary/10 rounded px-2 py-1"
                          >
                            <span className="font-medium">{player.name}</span>
                            <span className="text-primary font-semibold">{player.points} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
