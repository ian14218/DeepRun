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
    `SELECT id, name, seed, region, is_eliminated, eliminated_in_round, wins, external_id
     FROM tournament_teams
     ORDER BY region, seed ASC`
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
            p.season_ppg, p.season_rpg, p.season_apg,
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

module.exports = { getStats, getAllLeagues, getLeagueDetail, deleteLeague, resetDraft, getTournamentTeams, getTournamentPlayers };
