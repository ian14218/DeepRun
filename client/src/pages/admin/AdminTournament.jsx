import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { getAdminStats, getAdminTeams, getAdminPlayers, simulateTournamentRound, resetSimulation, getFirstFourPairs, createFirstFourPair, removeFirstFourPair, backfillSync, seedTournament, seedFirstFour, togglePlayerInjury } from '../../services/adminService';
import { toast } from 'sonner';
import TeamLogo from '../../components/TeamLogo';

export default function AdminTournament() {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);

  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const [playerData, setPlayerData] = useState({ players: [], total: 0, page: 1, limit: 20 });
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerTeamFilter, setPlayerTeamFilter] = useState('');
  const [playersLoading, setPlayersLoading] = useState(true);

  // First Four state
  const [ffPairs, setFfPairs] = useState([]);
  const [ffTeamA, setFfTeamA] = useState('');
  const [ffTeamB, setFfTeamB] = useState('');
  const [ffLoading, setFfLoading] = useState(false);

  // Setup tab state
  const [seedYear, setSeedYear] = useState(2026);
  const [seeding, setSeeding] = useState(false);
  const [seedingFf, setSeedingFf] = useState(false);
  const [backfillDates, setBackfillDates] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    getAdminStats()
      .then((stats) => setSimulationEnabled(!!stats.simulationEnabled))
      .catch(() => {});
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

  async function handleResetSimulation() {
    setResetting(true);
    try {
      const result = await resetSimulation(includeDrafts);
      const msg = includeDrafts
        ? `Reset: ${result.deletedStats} stats, ${result.resetTeams} teams, ${result.deletedPicks} picks, ${result.resetLeagues} leagues`
        : `Reset: ${result.deletedStats} stats, ${result.resetTeams} teams, ${result.resetPlayers} players`;
      toast.success(msg);
      const updatedTeams = await getAdminTeams();
      setTeams(updatedTeams);
      setResetOpen(false);
      setIncludeDrafts(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed');
    } finally {
      setResetting(false);
    }
  }

  // First Four handlers
  const fetchFfPairs = useCallback(() => {
    setFfLoading(true);
    getFirstFourPairs()
      .then((data) => setFfPairs(Array.isArray(data) ? data : []))
      .catch(() => {
        setFfPairs([]);
        toast.error('Failed to load First Four pairs');
      })
      .finally(() => setFfLoading(false));
  }, []);

  useEffect(() => {
    fetchFfPairs();
  }, [fetchFfPairs]);

  async function handleCreateFfPair() {
    if (!ffTeamA || !ffTeamB || ffTeamA === ffTeamB) {
      toast.error('Select two different teams');
      return;
    }
    try {
      await createFirstFourPair(ffTeamA, ffTeamB);
      toast.success('First Four pair created');
      setFfTeamA('');
      setFfTeamB('');
      fetchFfPairs();
      // Refresh teams to show updated is_first_four
      const updatedTeams = await getAdminTeams();
      setTeams(updatedTeams);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create pair');
    }
  }

  async function handleRemoveFfPair(teamId) {
    try {
      await removeFirstFourPair(teamId);
      toast.success('First Four pair removed');
      fetchFfPairs();
      const updatedTeams = await getAdminTeams();
      setTeams(updatedTeams);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove pair');
    }
  }

  async function handleSeedTournament() {
    setSeeding(true);
    try {
      const result = await seedTournament(seedYear);
      toast.success(result.message);
      if (result.note) toast.info(result.note);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }

  async function handleSeedFirstFour() {
    setSeedingFf(true);
    try {
      const result = await seedFirstFour();
      toast.success(result.message);
      fetchFfPairs();
    } catch (err) {
      toast.error(err.response?.data?.error || 'First Four seed failed');
    } finally {
      setSeedingFf(false);
    }
  }

  async function handleBackfill() {
    const dates = backfillDates
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    if (dates.length === 0) {
      toast.error('Enter at least one date');
      return;
    }
    setBackfilling(true);
    try {
      const result = await backfillSync(dates);
      const total = result.results.reduce((sum, r) => sum + (r.gamesProcessed || 0), 0);
      toast.success(`Backfill complete: ${result.results.length} date(s), ${total} game(s) processed`);
      setBackfillDates('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  }

  async function handleToggleInjury(player) {
    const newStatus = player.injury_status === 'Out' ? null : 'Out';
    try {
      await togglePlayerInjury(player.id, newStatus);
      toast.success(`${player.name} marked as ${newStatus === 'Out' ? 'OUT' : 'Active'}`);
      fetchPlayers(playerSearch, playerTeamFilter, playerData.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update injury status');
    }
  }

  const playerTotalPages = Math.ceil(playerData.total / playerData.limit);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">Tournament Management</h1>

      <Tabs defaultValue="teams">
        <TabsList className="mb-4">
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="firstfour">First Four</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="teams">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-lg">Tournament Teams ({teams.length})</CardTitle>
                {simulationEnabled && (
                  <div className="flex gap-2">
                    <Button onClick={handleSimulateRound} disabled={simulating} size="sm">
                      {simulating ? 'Simulating...' : 'Simulate Round'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setResetOpen(true)}
                    >
                      Reset
                    </Button>
                  </div>
                )}
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
                            {t.is_first_four && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-amber-500/15 text-amber-600 border-amber-500/30">
                                FF
                              </Badge>
                            )}
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
                    <TableHead>Injury</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playersLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : playerData.players.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                        <TableCell>
                          <Button
                            size="sm"
                            variant={p.injury_status === 'Out' ? 'destructive' : 'outline'}
                            onClick={() => handleToggleInjury(p)}
                            className="h-7 text-xs px-2"
                          >
                            {p.injury_status === 'Out' ? 'OUT' : 'Healthy'}
                          </Button>
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
        <TabsContent value="firstfour">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">First Four Pairs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Create pair form */}
              <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg border border-dashed">
                <select
                  value={ffTeamA}
                  onChange={(e) => setFfTeamA(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select Team A...</option>
                  {teams
                    .filter((t) => !t.is_first_four)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        ({t.seed}) {t.name} — {t.region}
                      </option>
                    ))}
                </select>
                <select
                  value={ffTeamB}
                  onChange={(e) => setFfTeamB(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select Team B...</option>
                  {teams
                    .filter((t) => !t.is_first_four)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        ({t.seed}) {t.name} — {t.region}
                      </option>
                    ))}
                </select>
                <Button onClick={handleCreateFfPair} disabled={!ffTeamA || !ffTeamB}>
                  Create Pair
                </Button>
              </div>

              {/* Current pairs */}
              {ffLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
              ) : ffPairs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No First Four pairs configured</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team A</TableHead>
                      <TableHead>Team B</TableHead>
                      <TableHead>Seed</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ffPairs.map((pair) => (
                      <TableRow key={pair.team_a_id}>
                        <TableCell className="font-medium">{pair.team_a_name}</TableCell>
                        <TableCell className="font-medium">{pair.team_b_name}</TableCell>
                        <TableCell>{pair.team_a_seed}</TableCell>
                        <TableCell>{pair.team_a_region}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemoveFfPair(pair.team_a_id)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="setup">
          <div className="space-y-4">
            {/* Seed Tournament */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Seed Tournament</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Import teams and rosters from ESPN. Runs in the background — check server logs for progress.
                </p>
              </CardHeader>
              <CardContent className="flex items-end gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Year</label>
                  <Input
                    type="number"
                    value={seedYear}
                    onChange={(e) => setSeedYear(parseInt(e.target.value, 10))}
                    min={2020}
                    max={2030}
                    className="w-28"
                  />
                </div>
                <Button onClick={handleSeedTournament} disabled={seeding}>
                  {seeding ? 'Seeding...' : 'Seed Tournament'}
                </Button>
              </CardContent>
            </Card>

            {/* Seed First Four */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Seed First Four Pairs</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Auto-detect First Four pairs from tournament data. Run after tournament seeding completes.
                </p>
              </CardHeader>
              <CardContent>
                <Button onClick={handleSeedFirstFour} disabled={seedingFf}>
                  {seedingFf ? 'Seeding...' : 'Seed First Four'}
                </Button>
              </CardContent>
            </Card>

            {/* Backfill Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Backfill Stats</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Sync game stats from ESPN for specific dates. Use YYYYMMDD format, one date per line.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  value={backfillDates}
                  onChange={(e) => setBackfillDates(e.target.value)}
                  placeholder={"20260319\n20260320"}
                  rows={4}
                  className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground"
                />
                <div>
                  <Button onClick={handleBackfill} disabled={backfilling}>
                    {backfilling ? 'Backfilling...' : 'Backfill'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Simulation</DialogTitle>
            <DialogDescription>
              This will clear all game stats and restore every team and player to active status.
              You can then re-simulate with fresh random results.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={(e) => setIncludeDrafts(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">
              Also reset all drafts back to pre-draft
            </span>
          </label>
          {includeDrafts && (
            <p className="text-xs text-destructive">
              This will delete all draft picks and reset every league to pre-draft status.
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleResetSimulation} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
