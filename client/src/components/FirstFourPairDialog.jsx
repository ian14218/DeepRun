import { useState, useEffect, useMemo } from 'react';
import { getFirstFourPartnerPlayers } from '@/services/draftService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TeamLogo from './TeamLogo';
import PriceTag from './bestball/PriceTag';
import { cn } from '@/lib/utils';

export default function FirstFourPairDialog({
  open,
  onOpenChange,
  primaryPlayer,
  onConfirm,
  mode = 'draft', // 'draft' or 'bestball'
  pickedPlayerIds = [],
}) {
  const [partnerPlayers, setPartnerPlayers] = useState([]);
  const [partnerTeam, setPartnerTeam] = useState(null);
  const [selectedPairedId, setSelectedPairedId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Stabilize pickedPlayerIds to avoid infinite re-fetch loops
  const pickedKey = useMemo(() => JSON.stringify(pickedPlayerIds), [pickedPlayerIds]);

  useEffect(() => {
    if (!open || !primaryPlayer?.team_id) return;
    setSelectedPairedId(null);
    setLoading(true);
    const picked = JSON.parse(pickedKey);
    getFirstFourPartnerPlayers(primaryPlayer.team_id)
      .then((data) => {
        const available = data.players
          .filter((p) => !picked.includes(p.id))
          .sort((a, b) => (parseFloat(b.season_ppg) || 0) - (parseFloat(a.season_ppg) || 0));
        setPartnerPlayers(available);
        setPartnerTeam(data.partnerTeam || null);
      })
      .catch(() => { setPartnerPlayers([]); setPartnerTeam(null); })
      .finally(() => setLoading(false));
  }, [open, primaryPlayer?.team_id, pickedKey]);

  const handleConfirm = () => {
    if (!selectedPairedId) return;
    onConfirm(primaryPlayer.id || primaryPlayer.player_id, selectedPairedId);
    onOpenChange(false);
  };

  const pairPrice = mode === 'bestball' && primaryPlayer?.price && selectedPairedId
    ? Math.max(
        primaryPlayer.price,
        partnerPlayers.find((p) => p.id === selectedPairedId)?.price || 0
      )
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>First Four Pair Selection</DialogTitle>
          <DialogDescription>
            {primaryPlayer?.name || 'This player'} is on a First Four team.
            Select a player from the partner team to complete the pair.
          </DialogDescription>
        </DialogHeader>

        {/* Primary player */}
        <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2">
            {primaryPlayer?.team_external_id && (
              <TeamLogo externalId={primaryPlayer.team_external_id} teamName={primaryPlayer.team_name} size={20} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{primaryPlayer?.name}</p>
              <p className="text-xs text-muted-foreground">{primaryPlayer?.team_name}</p>
            </div>
            <Badge variant="secondary" className="text-xs">Primary</Badge>
          </div>
        </div>

        {/* Partner team header + players */}
        {partnerTeam && (
          <div className="flex items-center gap-2 pt-1">
            <TeamLogo externalId={partnerTeam.external_id} teamName={partnerTeam.name} size={20} />
            <p className="text-sm font-medium">{partnerTeam.name}</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">#{partnerTeam.seed} {partnerTeam.region}</Badge>
          </div>
        )}
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading partner players...</p>
          ) : partnerPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No available players on partner team</p>
          ) : (
            partnerPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPairedId(p.id)}
                className={cn(
                  'w-full flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors',
                  selectedPairedId === p.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-muted-foreground/40 hover:bg-secondary/50'
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.position} · {p.season_ppg ? parseFloat(p.season_ppg).toFixed(1) : '0.0'} PPG
                  </p>
                </div>
                {mode === 'bestball' && p.price != null && (
                  <PriceTag price={p.price} className="text-sm" />
                )}
                {selectedPairedId === p.id && (
                  <Badge variant="secondary" className="text-xs">Paired</Badge>
                )}
              </button>
            ))
          )}
        </div>

        {/* Pair price for Best Ball mode */}
        {mode === 'bestball' && pairPrice != null && (
          <div className="text-sm text-center text-muted-foreground">
            Pair Price: <span className="font-semibold text-foreground">${pairPrice}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selectedPairedId}>
            Confirm Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
