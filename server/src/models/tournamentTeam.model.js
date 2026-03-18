const pool = require('../db');

// Map wins count to a human-readable round name
const ROUND_BY_WINS = {
  0: 'Round of 64',
  1: 'Round of 32',
  2: 'Sweet 16',
  3: 'Elite 8',
  4: 'Final Four',
  5: 'Championship',
  6: 'Champion',
};

function addCurrentRound(team) {
  // First Four winners get +1 win from the play-in that doesn't count for
  // bracket advancement. Offset so current_round reflects tournament progress.
  const effectiveWins = team.is_first_four ? Math.max(0, team.wins - 1) : team.wins;
  return { ...team, current_round: ROUND_BY_WINS[effectiveWins] || 'Round of 64' };
}

async function findAll() {
  const result = await pool.query(
    `SELECT * FROM tournament_teams ORDER BY region, seed`
  );
  return result.rows.map(addCurrentRound);
}

async function findById(id) {
  const result = await pool.query(
    `SELECT * FROM tournament_teams WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function findByExternalId(externalId) {
  const result = await pool.query(
    `SELECT * FROM tournament_teams WHERE external_id = $1`,
    [externalId]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function eliminate(id, round) {
  const result = await pool.query(
    `UPDATE tournament_teams
     SET is_eliminated = true, eliminated_in_round = $2
     WHERE id = $1
     RETURNING *`,
    [id, round]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function updateWins(id, wins) {
  const result = await pool.query(
    `UPDATE tournament_teams SET wins = $2 WHERE id = $1 RETURNING *`,
    [id, wins]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

/**
 * Sets wins to the count of distinct games in player_game_stats for this
 * team's players. Idempotent: running multiple times after the same game is
 * final always produces the correct win total.
 */
async function updateWinsFromStats(id) {
  const result = await pool.query(
    `UPDATE tournament_teams
     SET wins = (
       SELECT COUNT(DISTINCT pgs.external_game_id)::int
       FROM player_game_stats pgs
       JOIN players p ON p.id = pgs.player_id
       WHERE p.team_id = $1
     ) + CASE WHEN is_first_four AND NOT is_eliminated THEN 1 ELSE 0 END
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function upsert(name, seed, region, externalId) {
  const result = await pool.query(
    `INSERT INTO tournament_teams (name, seed, region, external_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (external_id) DO UPDATE
       SET name = EXCLUDED.name, seed = EXCLUDED.seed, region = EXCLUDED.region
     RETURNING *`,
    [name, seed, region, externalId]
  );
  return addCurrentRound(result.rows[0]);
}

async function setFirstFourPartner(teamAId, teamBId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE tournament_teams SET is_first_four = true, first_four_partner_id = $2 WHERE id = $1`,
      [teamAId, teamBId]
    );
    await client.query(
      `UPDATE tournament_teams SET is_first_four = true, first_four_partner_id = $1 WHERE id = $2`,
      [teamAId, teamBId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getFirstFourPairs() {
  const result = await pool.query(
    `SELECT t1.id AS team_a_id, t1.name AS team_a_name, t1.seed AS team_a_seed, t1.region AS team_a_region,
            t2.id AS team_b_id, t2.name AS team_b_name, t2.seed AS team_b_seed, t2.region AS team_b_region
     FROM tournament_teams t1
     JOIN tournament_teams t2 ON t1.first_four_partner_id = t2.id
     WHERE t1.is_first_four = true AND t1.id < t2.id
     ORDER BY t1.region, t1.seed`
  );
  return result.rows;
}

async function clearFirstFourPair(teamId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Get the partner first
    const partnerResult = await client.query(
      `SELECT first_four_partner_id FROM tournament_teams WHERE id = $1`,
      [teamId]
    );
    const partnerId = partnerResult.rows[0]?.first_four_partner_id;
    // Clear this team
    await client.query(
      `UPDATE tournament_teams SET is_first_four = false, first_four_partner_id = NULL WHERE id = $1`,
      [teamId]
    );
    // Clear the partner
    if (partnerId) {
      await client.query(
        `UPDATE tournament_teams SET is_first_four = false, first_four_partner_id = NULL WHERE id = $1`,
        [partnerId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { findAll, findById, findByExternalId, eliminate, updateWins, updateWinsFromStats, upsert, setFirstFourPartner, getFirstFourPairs, clearFirstFourPair, ROUND_BY_WINS };
