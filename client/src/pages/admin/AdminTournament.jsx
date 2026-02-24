import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getAdminTeams, getAdminPlayers, simulateTournamentRound } from '../../services/adminService';
import { toast } from 'sonner';
import TeamLogo from '../../components/TeamLogo';

export default function AdminTournament() {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);

  const [simulating, setSimulating] = useState(false);

  const [playerData, setPlayerData] = useState({ players: [], total: 0, page: 1, limit: 20 });
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerTeamFilter, setPlayerTeamFilter] = useState('');
  const [playersLoading, setPlayersLoading] = useState(true);

  useEffect(() => {
    getAdminTeams()
      .then(setTeams)
      .catch(() => toast.error('Failed to load teams'))
      .finally(() => setTeamsLoading(false));
  }, []);

  const fetchPlayers = useCallback((s = playerSearch, t = playerTeamFilter, p = 1) => {
    setPlayersLoading(true);
    getAdminPlayers(s, t, p, 20)
      .then(setPlayerData)
      .catch(() => toast.error('Failed to load players'))
      .finally(() => setPlayersLoading(false));
  }, [playerSearch, playerTeamFilter]);

  useEffect(() => {
    fetchPlayers('', '', 1);
  }, []);

  function handlePlayerSearch(e) {
    e.preventDefault();
    fetchPlayers(playerSearch, playerTeamFilter, 1);
  }

  async function handleSimulateRound() {
    setSimulating(true);
    try {
      const result = await simulateTournamentRound();
      toast.success(`Simulated ${result.round}: ${result.games.length} games`);
      const updatedTeams = await getAdminTeams();
      setTeams(updatedTeams);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  }

  const playerTotalPages = Math.ceil(playerData.total / playerData.limit);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tournament Management</h1>

      <Tabs defaultValue="teams">
        <TabsList className="mb-4">
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
        </TabsList>

        <TabsContent value="teams">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Tournament Teams ({teams.length})</CardTitle>
                <Button onClick={handleSimulateRound} disabled={simulating} size="sm">
                  {simulating ? 'Simulating...' : 'Simulate Round'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Seed</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Eliminated In</TableHead>
                    <TableHead>Wins</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : teams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No teams found
                      </TableCell>
                    </TableRow>
                  ) : (
                    teams.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            <TeamLogo externalId={t.external_id} teamName={t.name} size={20} />
                            {t.name}
                          </span>
                        </TableCell>
                        <TableCell>{t.seed}</TableCell>
                        <TableCell>{t.region}</TableCell>
                        <TableCell>
                          {t.is_eliminated ? (
                            <Badge variant="destructive">Eliminated</Badge>
                          ) : (
                            <Badge variant="default">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.eliminated_in_round || '-'}
                        </TableCell>
                        <TableCell>{t.wins || 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-lg">Players ({playerData.total})</CardTitle>
                <form onSubmit={handlePlayerSearch} className="flex gap-2">
                  <Input
                    placeholder="Search players..."
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    className="w-56"
                  />
                  <Button type="submit" variant="secondary" size="icon">
                    <Search className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>PPG</TableHead>
                    <TableHead>RPG</TableHead>
                    <TableHead>APG</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playersLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : playerData.players.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No players found
                      </TableCell>
                    </TableRow>
                  ) : (
                    playerData.players.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <TeamLogo externalId={p.team_external_id} teamName={p.team_name} size={18} />
                            {p.team_name || '-'}
                            {p.team_seed && <span className="text-xs ml-1">({p.team_seed})</span>}
                          </span>
                        </TableCell>
                        <TableCell>{p.position || '-'}</TableCell>
                        <TableCell>{p.season_ppg != null ? Number(p.season_ppg).toFixed(1) : '-'}</TableCell>
                        <TableCell>{p.season_rpg != null ? Number(p.season_rpg).toFixed(1) : '-'}</TableCell>
                        <TableCell>{p.season_apg != null ? Number(p.season_apg).toFixed(1) : '-'}</TableCell>
                        <TableCell>
                          {p.is_eliminated ? (
                            <Badge variant="destructive">Out</Badge>
                          ) : (
                            <Badge variant="default">Active</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {playerTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    Page {playerData.page} of {playerTotalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={playerData.page <= 1}
                      onClick={() => fetchPlayers(playerSearch, playerTeamFilter, playerData.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={playerData.page >= playerTotalPages}
                      onClick={() => fetchPlayers(playerSearch, playerTeamFilter, playerData.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
