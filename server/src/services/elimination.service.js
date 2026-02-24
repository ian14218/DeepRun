const pool = require('../db');
const teamModel = require('../models/tournamentTeam.model');

/**
 * Atomically marks a tournament team as eliminated and flags all of their
 * players as eliminated. Uses a transaction so the DB can never be left in a
 * half-updated state.
 */
async function eliminateTeam(teamId, round) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE tournament_teams
       SET is_eliminated = true, eliminated_in_round = $2
       WHERE id = $1`,
      [teamId, round]
    );

    await client.query(
      `UPDATE players SET is_eliminated = true WHERE team_id = $1`,
      [teamId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return teamModel.findById(teamId);
}

module.exports = { eliminateTeam };
