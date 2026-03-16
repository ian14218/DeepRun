import { useState, useEffect, useCallback } from 'react';
import { getPlayerMarket } from '@/services/bestBallService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import PriceTag from './PriceTag';
import TeamLogo from '@/components/TeamLogo';
import FirstFourPairDialog from '@/components/FirstFourPairDialog';
import { Search, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';

export default function PlayerMarket({ contestId, roster, budgetRemaining, onAdd, readOnly }) {
  const [players, setPlayers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('price');
  const [page, setPage] = useState(1);
  const [ffDialogPlayer, setFfDialogPlayer] = useState(null);
  const limit = 25;

  const rosteredIds = new Set(
    roster.flatMap((r) => [r.player_id, r.paired_player_id].filter(Boolean))
  );

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlayerMarket(contestId, {
        search: search || undefined,
        maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
        sortBy,
        page,
        limit,
      });
      setPlayers(data.rows);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [contestId, search, maxPrice, sortBy, page]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Reset to page 1 when search/sort changes
  useEffect(() => {
    setPage(1);
  }, [search, maxPrice, sortBy]);

  const totalPages = Math.ceil(total / limit);

  const sortOptions = [
    { value: 'price', label: 'Price (High)' },
    { value: 'price_asc', label: 'Price (Low)' },
    { value: 'ppg', label: 'PPG' },
    { value: 'seed', label: 'Seed' },
    { value: 'name', label: 'Name' },
  ];

  function handleAddClick(player) {
    if (player.is_first_four) {
      setFfDialogPlayer(player);
    } else {
      onAdd(player.player_id);
    }
  }

  function handleFfConfirm(primaryId, pairedId) {
    onAdd(primaryId, pairedId);
    setFfDialogPlayer(null);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="relative w-32">
          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            placeholder="Max price"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {sortOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={sortBy === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : players.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No players found</p>
        ) : (
          players.map((player) => {
            const isRostered = rosteredIds.has(player.player_id);
            const isEliminated = player.is_eliminated;
            const isInjured = player.injury_status === 'Out';
            const tooExpensive = player.price > budgetRemaining;
            const unavailable = isRostered || isEliminated || isInjured;

            return (
              <div
                key={player.player_id}
                className={`flex items-center gap-3 p-3 border rounded-lg ${unavailable ? 'opacity-50' : ''}`}
              >
                <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={24} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {player.name}
                    {(isEliminated || isInjured) && (
                      <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0">
                        OUT
                      </Badge>
                    )}
                    {player.is_first_four && !isEliminated && !isInjured && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 bg-amber-500/15 text-amber-600 border-amber-500/30">
                        FF
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {player.team_name} · {player.seed}-seed
                    {player.season_ppg ? <span className="font-semibold text-foreground"> · {parseFloat(player.season_ppg).toFixed(1)} PPG</span> : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriceTag price={player.price} />
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant={isRostered ? 'outline' : 'default'}
                      disabled={unavailable || tooExpensive}
                      onClick={() => handleAddClick(player)}
                      className="h-8 px-3"
                    >
                      {isRostered ? 'Added' : isEliminated || isInjured ? 'Out' : 'Add'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="border rounded-lg overflow-hidden hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-center">Seed</TableHead>
              <TableHead className="text-center">PPG</TableHead>
              <TableHead className="text-right">Price</TableHead>
              {!readOnly && <TableHead className="w-20"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 5 : 6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : players.length === 0 ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 5 : 6} className="text-center py-8 text-muted-foreground">
                  No players found
                </TableCell>
              </TableRow>
            ) : (
              players.map((player) => {
                const isRostered = rosteredIds.has(player.player_id);
                const isEliminated = player.is_eliminated;
                const isInjured = player.injury_status === 'Out';
                const tooExpensive = player.price > budgetRemaining;
                const unavailable = isRostered || isEliminated || isInjured;

                return (
                  <TableRow key={player.player_id} className={unavailable ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TeamLogo externalId={player.team_external_id} teamName={player.team_name} size={18} />
                        <p className="font-medium">
                          {player.name}
                          {(isEliminated || isInjured) && (
                            <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0">
                              OUT
                            </Badge>
                          )}
                          {player.is_first_four && !isEliminated && !isInjured && (
                            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 bg-amber-500/15 text-amber-600 border-amber-500/30">
                              FF
                            </Badge>
                          )}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {player.team_name}
                    </TableCell>
                    <TableCell className="text-center">{player.seed}</TableCell>
                    <TableCell className="text-center">
                      {player.season_ppg ? parseFloat(player.season_ppg).toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <PriceTag price={player.price} />
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unavailable || tooExpensive}
                          onClick={() => handleAddClick(player)}
                        >
                          {isRostered ? 'Added' : isEliminated || isInjured ? 'Out' : 'Add'}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} players total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <FirstFourPairDialog
        open={!!ffDialogPlayer}
        onOpenChange={(open) => !open && setFfDialogPlayer(null)}
        primaryPlayer={ffDialogPlayer}
        onConfirm={handleFfConfirm}
        mode="bestball"
        pickedPlayerIds={[...rosteredIds]}
        contestId={contestId}
      />
    </div>
  );
}
