import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import TeamLogo from './TeamLogo';

// Standard NCAA bracket matchup order by seed
const SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

// Layout constants (px)
const SLOT_H = 34;
const SLOT_W = 192;
const PAIR_GAP = 6;      // gap between two teams in a matchup
const MATCHUP_GAP = 16;  // gap between matchups
const CONN_W = 32;       // width of connector SVG columns
const REGION_GAP = 48;   // vertical gap between stacked regions
const LABEL_H = 24;      // space reserved above bracket for round labels
const CENTER_W = 200;    // width of center Final Four / Championship column

const MATCHUP_H = 2 * SLOT_H + PAIR_GAP; // height of one matchup pair
const REGION_H = 8 * MATCHUP_H + 7 * MATCHUP_GAP; // total bracket height per region

const ROUND_NAMES = ['R64', 'R32', 'S16', 'E8'];

// Pre-compute y-positions for every team slot across all 4 rounds.
// R64 uses matchup-based spacing; later rounds center between their two feeders.
function computePositions() {
  const r64 = [];
  for (let m = 0; m < 8; m++) {
    const top = m * (MATCHUP_H + MATCHUP_GAP);
    r64.push(top);                       // top team of matchup
    r64.push(top + SLOT_H + PAIR_GAP);   // bottom team of matchup
  }

  const deriveNext = (prev) => {
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const midA = prev[i] + SLOT_H / 2;
      const midB = prev[i + 1] + SLOT_H / 2;
      next.push((midA + midB) / 2 - SLOT_H / 2);
    }
    return next;
  };

  const r32 = deriveNext(r64);
  const s16 = deriveNext(r32);
  const e8 = deriveNext(s16);
  return [r64, r32, s16, e8];
}

const POSITIONS = computePositions();

// ── Data builders ──────────────────────────────────────────────

function buildRegionRounds(teams) {
  // For First Four: multiple teams can share a seed. Use the FF winner as primary.
  const bySeed = {};
  teams.forEach((t) => {
    if (!bySeed[t.seed]) {
      bySeed[t.seed] = t;
    } else if (t.is_first_four && bySeed[t.seed].is_first_four) {
      const existing = bySeed[t.seed];
      // Both are First Four — pick the winner (more wins) as the primary slot holder.
      // Before FF is played both have 0 wins, so order doesn't matter.
      if (t.wins > existing.wins || (!t.is_eliminated && existing.is_eliminated)) {
        bySeed[t.seed] = { ...t, _ffPartner: existing };
      } else {
        bySeed[t.seed] = { ...existing, _ffPartner: t };
      }
    }
  });

  const r64 = SEED_MATCHUPS.flatMap(([a, b]) => [bySeed[a] || null, bySeed[b] || null]);
  const rounds = [r64];
  for (let r = 1; r <= 3; r++) {
    const prev = rounds[r - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const a = prev[i], b = prev[i + 1];
      // First Four winners get +1 win from the play-in that doesn't count
      // for bracket advancement (it gets them INTO R64, not past it).
      const aWins = a ? a.wins - (a.is_first_four ? 1 : 0) : 0;
      const bWins = b ? b.wins - (b.is_first_four ? 1 : 0) : 0;
      if (a && aWins >= r) next.push(a);
      else if (b && bWins >= r) next.push(b);
      else next.push(null);
    }
    rounds.push(next);
  }
  return rounds;
}

function effectiveWins(team) {
  if (!team) return 0;
  return team.wins - (team.is_first_four ? 1 : 0);
}

function buildFinalRounds(regionRounds) {
  const winner = (region) => {
    const e8 = regionRounds[region]?.[3];
    if (!e8) return null;
    if (e8[0] && effectiveWins(e8[0]) >= 4) return e8[0];
    if (e8[1] && effectiveWins(e8[1]) >= 4) return e8[1];
    return null;
  };

  const ff = [winner('East'), winner('West'), winner('South'), winner('Midwest')];

  const champ = [];
  for (let i = 0; i < 4; i += 2) {
    if (effectiveWins(ff[i]) >= 5) champ.push(ff[i]);
    else if (effectiveWins(ff[i + 1]) >= 5) champ.push(ff[i + 1]);
    else champ.push(null);
  }

  const champion = effectiveWins(champ[0]) >= 6 ? champ[0] : effectiveWins(champ[1]) >= 6 ? champ[1] : null;
  return { ff, champ, champion };
}

// ── Rendering components ───────────────────────────────────────

// Short team name for FF pairs in tight bracket slots
function shortName(name) {
  if (!name) return '?';
  const words = name.split(/\s+/);
  if (words.length === 1) return name.slice(0, 6);
  // For multi-word: use first word if short, otherwise initials
  if (words[0].length <= 6) return words[0];
  return words.map(w => w[0]).join('').toUpperCase();
}

// Border + background colors keyed by drafted player count
const DRAFT_COLORS = {
  1: { border: 'border-blue-500',    borderDim: 'border-blue-500/40',    bg: 'bg-blue-500/10',   bgDim: 'bg-blue-500/5',   badge: 'bg-blue-500' },
  2: { border: 'border-green-500',   borderDim: 'border-green-500/40',   bg: 'bg-green-500/10',  bgDim: 'bg-green-500/5',  badge: 'bg-green-500' },
  3: { border: 'border-orange-500',   borderDim: 'border-orange-500/40',  bg: 'bg-orange-500/10', bgDim: 'bg-orange-500/5', badge: 'bg-orange-500' },
  4: { border: 'border-purple-500',  borderDim: 'border-purple-500/40',  bg: 'bg-purple-500/10', bgDim: 'bg-purple-500/5', badge: 'bg-purple-500' },
  5: { border: 'border-yellow-500',  borderDim: 'border-yellow-500/40',  bg: 'bg-yellow-500/10', bgDim: 'bg-yellow-500/5', badge: 'bg-yellow-500' },
};

function getDraftStyle(count) {
  return DRAFT_COLORS[count] || DRAFT_COLORS[5]; // 5+ uses gold
}

function TeamSlot({ team, draftedCount }) {
  if (!team) {
    return (
      <div className="flex items-center gap-1.5 border border-dashed border-border/60 rounded px-2 bg-muted/20 h-full w-full">
        <span className="text-xs text-muted-foreground/60 italic">TBD</span>
      </div>
    );
  }

  const hasDrafted = draftedCount > 0;
  const eliminated = team.is_eliminated;
  const colors = hasDrafted ? getDraftStyle(draftedCount) : null;

  // First Four: show both team names before play-in resolves
  const hasFFPartner = team._ffPartner && !team._ffPartner.is_eliminated && !team.is_eliminated;

  return (
    <div className={cn(
      'flex items-center gap-1.5 border rounded px-2 text-xs h-full w-full transition-colors',
      hasDrafted && !eliminated && colors.border,
      hasDrafted && !eliminated && colors.bg,
      hasDrafted && eliminated && colors.borderDim,
      hasDrafted && eliminated && colors.bgDim,
      !hasDrafted && 'border-border bg-card',
      eliminated && 'opacity-50',
    )}>
      <span className="text-muted-foreground font-mono w-5 text-right shrink-0 text-[11px]">
        {team.seed}
      </span>
      <TeamLogo externalId={team.external_id} teamName={team.name} size={16} />
      {hasFFPartner && (
        <TeamLogo externalId={team._ffPartner.external_id} teamName={team._ffPartner.name} size={16} className="-ml-1" />
      )}
      <span className={cn('truncate font-medium', eliminated && 'line-through')}>
        {hasFFPartner ? (
          <>{shortName(team.name)}<span className="text-muted-foreground font-normal">/</span>{shortName(team._ffPartner.name)}</>
        ) : (
          team.name
        )}
      </span>
      {hasDrafted && (
        <Badge className={cn('ml-auto text-[10px] px-1 py-0 h-4 shrink-0 text-white', colors.badge)}>
          {draftedCount}
        </Badge>
      )}
    </div>
  );
}

function RoundCol({ slots, positions, draftedCountByTeam, label }) {
  return (
    <div className="relative shrink-0" style={{ width: SLOT_W, height: REGION_H }}>
      {label && (
        <div
          className="absolute left-0 right-0 text-center text-[11px] text-muted-foreground/70 font-medium"
          style={{ top: -LABEL_H }}
        >
          {label}
        </div>
      )}
      {slots.map((team, i) => (
        <div
          key={team ? team.external_id : `e-${i}`}
          className="absolute left-0"
          style={{ top: positions[i], height: SLOT_H, width: SLOT_W }}
        >
          <TeamSlot
            team={team}
            draftedCount={team ? (draftedCountByTeam[team.external_id] || 0) : 0}
          />
        </div>
      ))}
    </div>
  );
}

function ConnectorLines({ prevPositions, reverse }) {
  const pairCount = prevPositions.length / 2;
  return (
    <svg
      width={CONN_W}
      height={REGION_H}
      className="shrink-0 block"
      style={{ minWidth: CONN_W }}
    >
      {Array.from({ length: pairCount }).map((_, i) => {
        const topY = prevPositions[i * 2] + SLOT_H / 2;
        const botY = prevPositions[i * 2 + 1] + SLOT_H / 2;
        const midY = (topY + botY) / 2;
        const midX = CONN_W / 2;
        // Source side is where the two feeder teams are;
        // output side is where the single advancer goes.
        const [src, dst] = reverse ? [CONN_W, 0] : [0, CONN_W];

        return (
          <g key={i} strokeWidth="1.5" fill="none" className="stroke-muted-foreground/25">
            <line x1={src} y1={topY} x2={midX} y2={topY} />
            <line x1={src} y1={botY} x2={midX} y2={botY} />
            <line x1={midX} y1={topY} x2={midX} y2={botY} />
            <line x1={midX} y1={midY} x2={dst} y2={midY} />
          </g>
        );
      })}
    </svg>
  );
}

function RegionBracket({ label, rounds, draftedCountByTeam, reverse = false }) {
  // Build interleaved array: [roundCol, connector, roundCol, connector, ...]
  // For reversed regions the visual order is E8 → S16 → R32 → R64 (progressing toward outside)
  const elements = [];

  if (reverse) {
    for (let ri = 3; ri >= 0; ri--) {
      elements.push(
        <RoundCol
          key={`r-${ri}`}
          slots={rounds[ri]}
          positions={POSITIONS[ri]}
          draftedCountByTeam={draftedCountByTeam}
          label={ROUND_NAMES[ri]}
        />
      );
      if (ri > 0) {
        elements.push(
          <ConnectorLines key={`c-${ri}`} prevPositions={POSITIONS[ri - 1]} reverse />
        );
      }
    }
  } else {
    for (let ri = 0; ri <= 3; ri++) {
      elements.push(
        <RoundCol
          key={`r-${ri}`}
          slots={rounds[ri]}
          positions={POSITIONS[ri]}
          draftedCountByTeam={draftedCountByTeam}
          label={ROUND_NAMES[ri]}
        />
      );
      if (ri < 3) {
        elements.push(
          <ConnectorLines key={`c-${ri}`} prevPositions={POSITIONS[ri]} />
        );
      }
    }
  }

  return (
    <div className="shrink-0">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-center mb-1">
        {label}
      </h3>
      <div className="flex" style={{ paddingTop: LABEL_H }}>
        {elements}
      </div>
    </div>
  );
}

// ── Center column (Final Four + Championship + Champion) ───────

function CenterSlot({ team, draftedCountByTeam }) {
  return (
    <div style={{ width: CENTER_W - 16, height: SLOT_H }}>
      <TeamSlot
        team={team}
        draftedCount={team ? (draftedCountByTeam[team.external_id] || 0) : 0}
      />
    </div>
  );
}

function CenterColumn({ ff, champ, champion, draftedCountByTeam }) {
  return (
    <div
      className="flex flex-col items-center justify-center shrink-0 self-stretch"
      style={{ width: CENTER_W }}
    >
      {/* FF Game 1: East winner vs West winner */}
      <div className="flex flex-col items-center gap-1 mb-8">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          Final Four
        </span>
        <CenterSlot team={ff[0]} draftedCountByTeam={draftedCountByTeam} />
        <span className="text-[11px] text-muted-foreground leading-none">vs</span>
        <CenterSlot team={ff[1]} draftedCountByTeam={draftedCountByTeam} />
      </div>

      <div className="w-px h-6 bg-border/40" />

      {/* Championship */}
      <div className="flex flex-col items-center gap-1 my-4">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          Championship
        </span>
        <CenterSlot team={champ[0]} draftedCountByTeam={draftedCountByTeam} />
        <span className="text-[11px] text-muted-foreground leading-none">vs</span>
        <CenterSlot team={champ[1]} draftedCountByTeam={draftedCountByTeam} />
      </div>

      {/* Champion */}
      {champion ? (
        <>
          <div className="w-px h-4 bg-border/40" />
          <div className="flex flex-col items-center gap-1 mt-2 mb-4 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
            <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
              Champion
            </span>
            <CenterSlot team={champion} draftedCountByTeam={draftedCountByTeam} />
          </div>
        </>
      ) : (
        <div className="h-4" />
      )}

      <div className="w-px h-6 bg-border/40" />

      {/* FF Game 2: South winner vs Midwest winner */}
      <div className="flex flex-col items-center gap-1 mt-8">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          Final Four
        </span>
        <CenterSlot team={ff[2]} draftedCountByTeam={draftedCountByTeam} />
        <span className="text-[11px] text-muted-foreground leading-none">vs</span>
        <CenterSlot team={ff[3]} draftedCountByTeam={draftedCountByTeam} />
      </div>
    </div>
  );
}

// ── First Four Play-In Section ─────────────────────────────────

function FirstFourSection({ teams, draftedCountByTeam }) {
  // Collect FF pairs: group teams with is_first_four by region+seed
  const pairMap = {};
  teams.forEach((t) => {
    if (!t.is_first_four) return;
    const key = `${t.region}-${t.seed}`;
    if (!pairMap[key]) pairMap[key] = [];
    pairMap[key].push(t);
  });

  const pairs = Object.values(pairMap).filter((p) => p.length === 2);
  if (pairs.length === 0) return null;

  return (
    <div className="mb-4 px-4">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
        First Four Play-In Games
      </h3>
      <div className="flex flex-wrap gap-3">
        {pairs.map((pair) => {
          const [a, b] = pair;
          const aElim = a.is_eliminated;
          const bElim = b.is_eliminated;
          const resolved = aElim || bElim;
          return (
            <div
              key={`${a.id}-${b.id}`}
              className="flex items-center gap-1 border rounded-lg p-2 bg-card text-xs"
            >
              <span className="text-muted-foreground font-mono text-[11px] mr-1">
                {a.seed}
              </span>
              <div className="flex flex-col gap-0.5">
                <div className={cn(
                  'flex items-center gap-1.5 px-1.5 py-0.5 rounded',
                  resolved && !aElim && 'bg-accent/10 font-semibold',
                  aElim && 'opacity-40 line-through',
                )}>
                  <TeamLogo externalId={a.external_id} teamName={a.name} size={14} />
                  <span className="truncate max-w-[120px]">{a.name}</span>
                  {draftedCountByTeam[a.external_id] > 0 && (
                    <Badge className={cn('text-[9px] px-1 py-0 h-3.5 text-white', getDraftStyle(draftedCountByTeam[a.external_id]).badge)}>
                      {draftedCountByTeam[a.external_id]}
                    </Badge>
                  )}
                </div>
                <div className={cn(
                  'flex items-center gap-1.5 px-1.5 py-0.5 rounded',
                  resolved && !bElim && 'bg-accent/10 font-semibold',
                  bElim && 'opacity-40 line-through',
                )}>
                  <TeamLogo externalId={b.external_id} teamName={b.name} size={14} />
                  <span className="truncate max-w-[120px]">{b.name}</span>
                  {draftedCountByTeam[b.external_id] > 0 && (
                    <Badge className={cn('text-[9px] px-1 py-0 h-3.5 text-white', getDraftStyle(draftedCountByTeam[b.external_id]).badge)}>
                      {draftedCountByTeam[b.external_id]}
                    </Badge>
                  )}
                </div>
              </div>
              <span className="text-muted-foreground/60 text-[10px] ml-1">{a.region}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main bracket layout ────────────────────────────────────────

// Exported for testing
export { buildRegionRounds, buildFinalRounds };

export default function BracketView({ teams, draftedCountByTeam = {} }) {
  const byRegion = {};
  teams.forEach((t) => {
    if (!byRegion[t.region]) byRegion[t.region] = [];
    byRegion[t.region].push(t);
  });

  const regionRounds = {};
  ['East', 'West', 'South', 'Midwest'].forEach((r) => {
    regionRounds[r] = buildRegionRounds(byRegion[r] || []);
  });

  const { ff, champ, champion } = buildFinalRounds(regionRounds);

  // Total width: 2 region sides + center + gaps
  const regionW = 4 * SLOT_W + 3 * CONN_W;
  const totalW = 2 * regionW + CENTER_W + 32; // 32px for side padding

  return (
    <ScrollArea className="w-full">
      <FirstFourSection teams={teams} draftedCountByTeam={draftedCountByTeam} />
      <div className="flex items-start p-4" style={{ minWidth: totalW }}>
        {/* Left half: East (top) + West (bottom), progressing L → R */}
        <div className="shrink-0 flex flex-col" style={{ gap: REGION_GAP }}>
          <RegionBracket
            label="East"
            rounds={regionRounds.East}
            draftedCountByTeam={draftedCountByTeam}
          />
          <RegionBracket
            label="West"
            rounds={regionRounds.West}
            draftedCountByTeam={draftedCountByTeam}
          />
        </div>

        {/* Center: Final Four + Championship */}
        <CenterColumn
          ff={ff}
          champ={champ}
          champion={champion}
          draftedCountByTeam={draftedCountByTeam}
        />

        {/* Right half: South (top) + Midwest (bottom), progressing R → L */}
        <div className="shrink-0 flex flex-col" style={{ gap: REGION_GAP }}>
          <RegionBracket
            label="South"
            rounds={regionRounds.South}
            draftedCountByTeam={draftedCountByTeam}
            reverse
          />
          <RegionBracket
            label="Midwest"
            rounds={regionRounds.Midwest}
            draftedCountByTeam={draftedCountByTeam}
            reverse
          />
        </div>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
