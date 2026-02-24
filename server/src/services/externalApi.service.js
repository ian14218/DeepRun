/**
 * externalApi.service.js
 *
 * Abstraction layer over the external sports data API (ESPN hidden API).
 * All methods return data in the canonical shape that statSync.job.js expects,
 * insulating the rest of the codebase from external API changes.
 *
 * Return shapes:
 *
 *  fetchTodaysGames() → Array<{
 *    external_game_id: string,
 *    status: 'upcoming' | 'in_progress' | 'final',
 *    tournament_round: string,
 *    winner_external_id: string | null,
 *    loser_external_id: string | null,
 *  }>
 *
 *  fetchGameBoxScore(externalGameId) → {
 *    external_game_id: string,
 *    game_date: string,          // 'YYYY-MM-DD'
 *    tournament_round: string,
 *    teams: Array<{
 *      external_team_id: string,
 *      players: Array<{ external_player_id: string, points: number }>,
 *    }>,
 *  }
 *
 *  fetchTournamentTeams() → Array<{
 *    external_id: string,
 *    name: string,
 *    seed: number,
 *    region: string,
 *  }>
 *
 *  fetchTeamRoster(externalTeamId) → Array<{
 *    external_id: string,
 *    name: string,
 *    position: string,
 *    jersey_number: number,
 *  }>
 */

const axios = require('axios');

const ESPN_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';

// ─── Round label mapping (ESPN uses ordinal slugs) ────────────────────────────

const ESPN_ROUND_LABELS = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'Championship',
};

function resolveRound(event) {
  const round = event.season?.type?.id
    ? parseInt(event.competitions?.[0]?.format?.regulation?.periods, 10)
    : null;
  // ESPN stores playoff round in notes or seasonType; fall back to 'Round of 64'
  const groupId = event.competitions?.[0]?.groups?.id;
  return ESPN_ROUND_LABELS[groupId] || 'Round of 64';
}

// ─── Transformers ─────────────────────────────────────────────────────────────

function transformGameSummary(event) {
  const stateId = event.status?.type?.state;
  const isCompleted = event.status?.type?.completed === true;

  let status;
  if (isCompleted) {
    status = 'final';
  } else if (stateId === 'in') {
    status = 'in_progress';
  } else {
    status = 'upcoming';
  }

  const competitors = event.competitions?.[0]?.competitors || [];
  let winnerExternalId = null;
  let loserExternalId = null;

  if (status === 'final') {
    const winner = competitors.find((c) => c.winner === true);
    const loser = competitors.find((c) => c.winner === false);
    winnerExternalId = winner?.team?.id || null;
    loserExternalId = loser?.team?.id || null;
  }

  // Extract team names, IDs, and scores
  const teams = competitors.map((c) => ({
    external_team_id: String(c.team?.id || ''),
    name: c.team?.displayName || c.team?.shortDisplayName || '',
    score: parseInt(c.score, 10) || 0,
    is_home: c.homeAway === 'home',
  }));

  return {
    external_game_id: String(event.id),
    name: event.name || '',
    short_name: event.shortName || '',
    start_time: event.date || null,
    status,
    status_detail: event.status?.type?.shortDetail || '',
    tournament_round: resolveRound(event),
    winner_external_id: winnerExternalId,
    loser_external_id: loserExternalId,
    teams,
  };
}

function transformBoxScore(data, externalGameId) {
  const dateStr = data.header?.competitions?.[0]?.date?.split('T')[0] || new Date().toISOString().split('T')[0];

  const teams = (data.boxscore?.players || []).map((teamEntry) => {
    const externalTeamId = String(teamEntry.team?.id || '');

    const players = [];
    for (const statGroup of teamEntry.statistics || []) {
      for (const athlete of statGroup.athletes || []) {
        const stats = athlete.stats || [];
        // ESPN: stats array order is PTS last in most formats; find by label
        const labels = statGroup.labels || [];
        const ptsIdx = labels.indexOf('PTS');
        const ptsStr = ptsIdx >= 0 ? stats[ptsIdx] : '0';
        const points = parseInt(ptsStr, 10) || 0;

        players.push({
          external_player_id: String(athlete.athlete?.id || ''),
          points,
        });
      }
    }

    return { external_team_id: externalTeamId, players };
  });

  const tournamentRound =
    data.header?.competitions?.[0]?.notes?.[0]?.headline || 'Round of 64';

  return {
    external_game_id: externalGameId,
    game_date: dateStr,
    tournament_round: tournamentRound,
    teams,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchTodaysGames() {
  const resp = await axios.get(`${ESPN_BASE}/scoreboard`, {
    params: { groups: 100 },
  });
  const events = resp.data.events || [];
  return events.map(transformGameSummary);
}

async function fetchGameBoxScore(externalGameId) {
  const resp = await axios.get(`${ESPN_BASE}/summary`, {
    params: { event: externalGameId },
  });
  return transformBoxScore(resp.data, externalGameId);
}

async function fetchTournamentTeams() {
  const resp = await axios.get(`${ESPN_BASE}/teams`, {
    params: { groups: 100, limit: 100 },
  });
  const teams = resp.data.sports?.[0]?.leagues?.[0]?.teams || [];
  return teams.map((entry) => ({
    external_id: String(entry.team.id),
    name: entry.team.displayName,
    seed: null, // seed is bracket-specific, not in the teams endpoint
    region: null,
  }));
}

async function fetchTeamRoster(externalTeamId) {
  const resp = await axios.get(`${ESPN_BASE}/teams/${externalTeamId}/roster`);
  const athletes = resp.data.athletes || [];
  return athletes.map((a) => ({
    external_id: String(a.id),
    name: a.displayName,
    position: a.position?.abbreviation || 'F',
    jersey_number: parseInt(a.jersey, 10) || 0,
  }));
}

module.exports = {
  fetchTodaysGames,
  fetchGameBoxScore,
  fetchTournamentTeams,
  fetchTeamRoster,
};
