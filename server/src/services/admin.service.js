const pool = require('../db');

async function getStats() {
  const [users, leagues, activeDrafts, teams, players] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM users WHERE is_bot = FALSE'),
    pool.query('SELECT COUNT(*) FROM leagues'),
    pool.query("SELECT COUNT(*) FROM leagues WHERE draft_status = 'in_progress'"),
    pool.query('SELECT COUNT(*) FROM tournament_teams'),
    pool.query('SELECT COUNT(*) FROM players'),
  ]);

  return {
    userCount: parseInt(users.rows[0].count, 10),
    leagueCount: parseInt(leagues.rows[0].count, 10),
    activeDrafts: parseInt(activeDrafts.rows[0].count, 10),
    teamCount: parseInt(teams.rows[0].count, 10),
    playerCount: parseInt(players.rows[0].count, 10),
    simulationEnabled: process.env.SIMULATION_ENABLED === 'true',
  };
}

async function getAllLeagues(search = '', status = '', page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (search) {
    conditions.push(`l.name ILIKE $${paramIdx}`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (status) {
    conditions.push(`l.draft_status = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM leagues l ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT l.*,
            u.username AS commissioner_name,
            (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) AS member_count
     FROM leagues l
     LEFT JOIN users u ON u.id = l.commissioner_id
     ${whereClause}
     ORDER BY l.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return { leagues: result.rows, total, page, limit };
}

async function getLeagueDetail(id) {
  const leagueResult = await pool.query(
    `SELECT l.*, u.username AS commissioner_name
     FROM leagues l
     LEFT JOIN users u ON u.id = l.commissioner_id
     WHERE l.id = $1`,
    [id]
  );

  if (!leagueResult.rows[0]) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }

  const league = leagueResult.rows[0];

  const members = await pool.query(
    `SELECT lm.*, u.username, u.email, u.is_bot
     FROM league_members lm
     JOIN users u ON u.id = lm.user_id
     WHERE lm.league_id = $1
     ORDER BY lm.draft_position ASC NULLS LAST, lm.joined_at ASC`,
    [id]
  );

  const picks = await pool.query(
    `SELECT dp.*, p.name AS player_name, p.position AS player_position,
            u.username AS picker_name
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     JOIN league_members lm ON lm.id = dp.member_id
     JOIN users u ON u.id = lm.user_id
     WHERE dp.league_id = $1
     ORDER BY dp.pick_number ASC`,
    [id]
  );

  return { ...league, members: members.rows, picks: picks.rows };
}

async function deleteLeague(id) {
  // Delete in order: draft_picks → league_members → league
  await pool.query('DELETE FROM draft_picks WHERE league_id = $1', [id]);
  await pool.query('DELETE FROM league_members WHERE league_id = $1', [id]);
  await pool.query('DELETE FROM leagues WHERE id = $1', [id]);
}

async function resetDraft(leagueId) {
  const league = await pool.query('SELECT id FROM leagues WHERE id = $1', [leagueId]);
  if (!league.rows[0]) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }

  await pool.query('DELETE FROM draft_picks WHERE league_id = $1', [leagueId]);
  await pool.query('UPDATE league_members SET draft_position = NULL WHERE league_id = $1', [leagueId]);
  await pool.query("UPDATE leagues SET draft_status = 'pre_draft' WHERE id = $1", [leagueId]);
}

async function getTournamentTeams() {
  const result = await pool.query(
    `SELECT * FROM tournament_teams ORDER BY region, seed ASC`
  );
  return result.rows;
}

async function getTournamentPlayers(search = '', team = '', page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (search) {
    conditions.push(`p.name ILIKE $${paramIdx}`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (team) {
    conditions.push(`p.team_id = $${paramIdx}`);
    params.push(team);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM players p ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT p.id, p.name, p.position, p.jersey_number, p.is_eliminated,
            p.injury_status, p.season_ppg, p.season_rpg, p.season_apg,
            t.name AS team_name, t.seed AS team_seed, t.region AS team_region,
            t.external_id AS team_external_id
     FROM players p
     LEFT JOIN tournament_teams t ON t.id = p.team_id
     ${whereClause}
     ORDER BY p.season_ppg DESC NULLS LAST
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return { players: result.rows, total, page, limit };
}

async function resetSimulation({ includeDrafts = false } = {}) {
  const stats = await pool.query('DELETE FROM player_game_stats');

  const teams = await pool.query(
    `UPDATE tournament_teams
     SET is_eliminated = false, eliminated_in_round = NULL, wins = 0
     WHERE is_eliminated = true OR wins > 0`
  );

  const players = await pool.query(
    `UPDATE players SET is_eliminated = false WHERE is_eliminated = true`
  );

  // Reset Best Ball contests back to open and zero out scores
  const contests = await pool.query(
    `UPDATE best_ball_contests SET status = 'open', updated_at = NOW()
     WHERE status IN ('live', 'locked', 'completed') RETURNING id`
  );
  const entries = await pool.query(
    `UPDATE best_ball_entries SET total_score = 0 WHERE total_score != 0`
  );

  // Restore First Four pairs from bracket structure (teams sharing seed+region)
  const ffRestored = await pool.query(
    `WITH pairs AS (
       SELECT t1.id AS id_a, t2.id AS id_b
       FROM tournament_teams t1
       JOIN tournament_teams t2
         ON t1.region = t2.region AND t1.seed = t2.seed AND t1.id < t2.id
     )
     UPDATE tournament_teams t
     SET is_first_four = true,
         first_four_partner_id = CASE
           WHEN t.id = pairs.id_a THEN pairs.id_b
           WHEN t.id = pairs.id_b THEN pairs.id_a
         END
     FROM pairs
     WHERE t.id IN (pairs.id_a, pairs.id_b)
       AND (t.is_first_four = false OR t.first_four_partner_id IS NULL)
     RETURNING t.id`
  );

  const result = {
    deletedStats: stats.rowCount,
    resetTeams: teams.rowCount,
    resetPlayers: players.rowCount,
    resetContests: contests.rowCount,
    resetEntries: entries.rowCount,
    restoredFirstFourTeams: ffRestored.rowCount,
  };

  if (includeDrafts) {
    const picks = await pool.query('DELETE FROM draft_picks');
    const members = await pool.query(
      `UPDATE league_members SET draft_position = NULL WHERE draft_position IS NOT NULL`
    );
    const leagues = await pool.query(
      `UPDATE leagues SET draft_status = 'pre_draft' WHERE draft_status != 'pre_draft'`
    );
    result.deletedPicks = picks.rowCount;
    result.resetMembers = members.rowCount;
    result.resetLeagues = leagues.rowCount;
  }

  return result;
}

async function refreshSeasonStats({ year = 2026 } = {}) {
  const axios = require('axios');
  const ESPN_STATS_BASE =
    'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball';

  // Get all players with an external_id
  const { rows: players } = await pool.query(
    `SELECT id, external_id, name FROM players WHERE external_id IS NOT NULL ORDER BY season_ppg DESC NULLS LAST`
  );

  const currentSeasonLabel = `${year - 1}-${String(year).slice(2)}`;
  let updated = 0;
  let failed = 0;

  for (const player of players) {
    try {
      const resp = await axios.get(
        `${ESPN_STATS_BASE}/athletes/${player.external_id}/stats`,
        { timeout: 5000 }
      );
      const categories = resp.data.categories || [];
      const averages = categories.find((c) => c.displayName === 'Season Averages');
      if (!averages) { failed++; continue; }

      const statistics = averages.statistics || {};
      const statEntries = Object.values(statistics);
      let values = null;

      // Log the first player's available seasons so we can see ESPN's format
      if (updated === 0 && failed === 0 && statEntries.length > 0) {
        const seasonNames = statEntries.map((s) => s.displayName);
        console.log(`[refresh-stats] ESPN season labels for ${player.name}: ${JSON.stringify(seasonNames)}`);
        console.log(`[refresh-stats] Looking for: "${currentSeasonLabel}"`);
      }

      // Current season first — try multiple label formats
      const currentSeason = statEntries.find(
        (s) => s.displayName === currentSeasonLabel
          || s.displayName === String(year)
          || s.displayName === `${year - 1}-${year}`
      );
      if (currentSeason && currentSeason.stats && currentSeason.stats.length > 0) {
        values = currentSeason.stats;
      }
      // Fallback: last entry (most recent season)
      if (!values && statEntries.length > 0) {
        values = statEntries[statEntries.length - 1].stats;
      }
      // Last resort: career totals
      if (!values || values.length === 0) {
        values = averages.totals;
      }
      if (!values || values.length === 0) { failed++; continue; }

      const labels = averages.labels || [];
      const get = (label) => {
        const idx = labels.indexOf(label);
        return idx >= 0 ? parseFloat(values[idx]) || 0 : 0;
      };

      await pool.query(
        `UPDATE players
         SET season_ppg = $1, season_rpg = $2, season_apg = $3,
             season_spg = $4, season_bpg = $5, season_mpg = $6, season_gp = $7
         WHERE id = $8`,
        [get('PTS'), get('REB'), get('AST'), get('STL'), get('BLK'), get('MIN'), Math.round(get('GP')), player.id]
      );
      updated++;
    } catch {
      failed++;
    }

    // Small delay to avoid ESPN rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  return { total: players.length, updated, failed };
}

module.exports = { getStats, getAllLeagues, getLeagueDetail, deleteLeague, resetDraft, resetSimulation, getTournamentTeams, getTournamentPlayers, refreshSeasonStats };
