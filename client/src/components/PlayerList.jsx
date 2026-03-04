import { useState, useEffect } from 'react';
import { getAvailablePlayers } from '../services/draftService';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import TeamLogo from './TeamLogo';
import FirstFourPairDialog from './FirstFourPairDialog';

export default function PlayerList({ canPick, onPick, pickedPlayerIds = [] }) {
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [sortBy, setSortBy] = useState('ppg');
  const [loading, setLoading] = useState(true);
  const [ffDialogPlayer, setFfDialogPlayer] = useState(null);

  useEffect(() => {
    getAvailablePlayers()
      .then((data) => setPlayers(data.players))
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, []);

  const teams = [...new Set(players.map((p) => p.team_name))].sort();

  const visible = players
    .filter((p) => {
      if (pickedPlayerIds.includes(p.id)) return false;
      if ((p.season_ppg || 0) < 3) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (teamFilter && p.team_name !== teamFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'seed') {
        const seedDiff = (a.seed || 99) - (b.seed || 99);
        if (seedDiff !== 0) return seedDiff;
        const teamCmp = (a.team_name || '').localeCompare(b.team_name || '');
        if (teamCmp !== 0) return teamCmp;
        return (b.season_ppg || 0) - (a.season_ppg || 0);
      }
      return (b.season_ppg || 0) - (a.season_ppg || 0);
    });

  function handlePickClick(player) {
    if (player.is_first_four) {
      setFfDialogPlayer(player);
    } else {
      onPick(player.id);
    }
  }

  function handleFfConfirm(primaryId, pairedId) {
    onPick(primaryId, pairedId);
    setFfDialogPlayer(null);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available Players</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex flex-col h-[450px] lg:h-full min-w-0 overflow-hidden">
        <CardHeader className="pb-3 space-y-3 shrink-0 overflow-hidden">
          <CardTitle className="text-base">Available Players</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex gap-2 min-w-0">
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="min-w-0 flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="shrink-0 w-24 h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="ppg">By PPG</option>
              <option value="seed">By Seed</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="divide-y divide-border">
              {visible.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-secondary/50 transition-colors gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {p.position}
                      </Badge>
                      {p.is_first_four && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0 bg-amber-500/15 text-amber-600 border-amber-500/30">
                          FF
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <TeamLogo externalId={p.team_external_id} teamName={p.team_name} size={14} />
                      <span className="truncate">{p.team_name}</span>
                      <span className="shrink-0">#{p.seed}</span>
                      {p.season_ppg > 0 && (
                        <span className="shrink-0 font-semibold text-foreground">{p.season_ppg} PPG</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={canPick ? 'default' : 'ghost'}
                    disabled={!canPick}
                    onClick={() => handlePickClick(p)}
                    className="shrink-0 h-7 text-xs px-2"
                  >
                    Pick
                  </Button>
                </div>
              ))}
              {visible.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No players found.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <FirstFourPairDialog
        open={!!ffDialogPlayer}
        onOpenChange={(open) => !open && setFfDialogPlayer(null)}
        primaryPlayer={ffDialogPlayer}
        onConfirm={handleFfConfirm}
        mode="draft"
        pickedPlayerIds={pickedPlayerIds}
      />
    </>
  );
}
