const pool = require('../db');
const { createError } = require('./errors');

/**
 * Validate a user-supplied First Four pairing.
 *
 * Returns the (possibly cleared) pairedPlayerId:
 *  - If the player is First Four and partner is alive, pairedPlayerId is validated and returned.
 *  - If the partner is eliminated, pairedPlayerId is cleared to null (First Four resolved).
 *  - If the player is not First Four and pairedPlayerId is supplied, throws.
 *
 * @param {object} opts
 * @param {boolean} opts.isFirstFour      — team.is_first_four
 * @param {string|null} opts.partnerId    — team.first_four_partner_id
 * @param {string|null} opts.pairedPlayerId — user-supplied paired player
 * @param {function} opts.findTeamById    — async (id) => team row
 * @param {function} opts.findPlayerById  — async (id) => player row
 * @returns {Promise<string|null>} validated pairedPlayerId
 */
async function validateFirstFourPairing({ isFirstFour, partnerId, pairedPlayerId, findTeamById, findPlayerById }) {
  if (!isFirstFour || !partnerId) {
    // Not a First Four player — reject any pairing attempt
    if (pairedPlayerId) {
      throw createError('Cannot pair a player who is not in the First Four', 400);
    }
    return null;
  }

  // Check if partner team is still alive
  const partnerTeam = await findTeamById(partnerId);
  const partnerAlive = partnerTeam && !partnerTeam.is_eliminated;

  if (partnerAlive) {
    if (!pairedPlayerId) {
      throw createError('First Four player requires a paired player from the partner team', 400);
    }
    const pairedPlayer = await findPlayerById(pairedPlayerId);
    if (!pairedPlayer) throw createError('Paired player not found', 404);
    if (pairedPlayer.team_id !== partnerId) {
      throw createError('Paired player must be from the First Four partner team', 400);
    }
    if (pairedPlayer.is_eliminated) {
      throw createError('Cannot draft an eliminated paired player', 400);
    }
    return pairedPlayerId;
  }

  // Partner eliminated — First Four resolved, clear pairing
  return null;
}

/**
 * Auto-pick a random paired player for a First Four selection (used by bot auto-pick).
 *
 * @param {object} chosen             — the chosen player row (must have is_first_four, first_four_partner_id)
 * @param {string[]} excludePlayerIds — IDs to exclude (already drafted/rostered)
 * @returns {Promise<string|null>} paired player ID or null
 */
async function pickRandomFirstFourPair(chosen, excludePlayerIds) {
  if (!chosen.is_first_four || !chosen.first_four_partner_id) return null;

  const partnerResult = await pool.query(
    'SELECT is_eliminated FROM tournament_teams WHERE id = $1',
    [chosen.first_four_partner_id]
  );
  if (!partnerResult.rows[0] || partnerResult.rows[0].is_eliminated) return null;

  const playerResult = await pool.query(
    `SELECT p.id FROM players p
     WHERE p.team_id = $1 AND p.id != ALL($2::uuid[]) AND p.is_eliminated = false
       AND COALESCE(p.injury_status, '') != 'Out'
     ORDER BY RANDOM() LIMIT 1`,
    [chosen.first_four_partner_id, excludePlayerIds]
  );
  return playerResult.rows[0]?.id || null;
}

module.exports = { validateFirstFourPairing, pickRandomFirstFourPair };
