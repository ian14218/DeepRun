const pool = require('../db');
const leagueModel = require('../models/league.model');
const draftPickModel = require('../models/draftPick.model');
const playerModel = require('../models/player.model');
const tournamentTeamModel = require('../models/tournamentTeam.model');

// ─── Draft timers (in-memory) ────────────────────────────────────────────────
const draftTimers = new Map(); // leagueId → { timeout, expiresAt, paused, remainingOnPause, io, disabled }

function clearDraftTimer(leagueId) {
  const existing = draftTimers.get(leagueId);
  if (existing) {
    clearTimeout(existing.timeout);
    draftTimers.delete(leagueId);
  }
}

function startDraftTimer(leagueId, seconds, io) {
  clearDraftTimer(leagueId);

  // If seconds is 0 or falsy, timer is disabled — don't set a timeout
  if (!seconds) {
    if (io) {
      io.to(`league:${leagueId}`).emit('draft:timer-disabled', {});
    }
    draftTimers.set(leagueId, { timeout: null, expiresAt: null, paused: false, remainingOnPause: null, io, disabled: true });
    return;
  }

  const expiresAt = Date.now() + seconds * 1000;

  // Emit timer start to clients
  if (io) {
    io.to(`league:${leagueId}`).emit('draft:timer', {
      seconds_remaining: seconds,
      expires_at: expiresAt,
    });
  }

  const timeout = setTimeout(async () => {
    draftTimers.delete(leagueId);
    try {
      await autoPickOnTimeout(leagueId, io);
    } catch {
      // Timer expired but auto-pick failed — next action will reset state
    }
  }, seconds * 1000);

  draftTimers.set(leagueId, { timeout, expiresAt, paused: false, remainingOnPause: null, io, disabled: false });
}

function pauseDraftTimer(leagueId, io) {
  const entry = draftTimers.get(leagueId);
  if (!entry || entry.paused || entry.disabled) return;

  clearTimeout(entry.timeout);
  const remaining = Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
  entry.timeout = null;
  entry.paused = true;
  entry.remainingOnPause = remaining;

  if (io) {
    io.to(`league:${leagueId}`).emit('draft:timer-paused', { seconds_remaining: remaining });
  }
}

function resumeDraftTimer(leagueId, io) {
  const entry = draftTimers.get(leagueId);
  if (!entry || !entry.paused || entry.disabled) return;

  const seconds = entry.remainingOnPause || 1;
  const expiresAt = Date.now() + seconds * 1000;

  entry.paused = false;
  entry.remainingOnPause = null;
  entry.expiresAt = expiresAt;

  if (io) {
    io.to(`league:${leagueId}`).emit('draft:timer', {
      seconds_remaining: seconds,
      expires_at: expiresAt,
    });
  }

  entry.timeout = setTimeout(async () => {
    draftTimers.delete(leagueId);
    try {
      await autoPickOnTimeout(leagueId, io);
    } catch {
      // Timer expired but auto-pick failed
    }
  }, seconds * 1000);
}

function getDraftTimerState(leagueId) {
  const entry = draftTimers.get(leagueId);
  if (!entry) return { paused: false, secondsRemaining: null, disabled: false };
  if (entry.disabled) return { paused: false, secondsRemaining: null, disabled: true };
  if (entry.paused) return { paused: true, secondsRemaining: entry.remainingOnPause, disabled: false };
  const remaining = Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
  return { paused: false, secondsRemaining: remaining, disabled: false };
}

/**
 * Auto-pick a random player when the timer expires for the current drafter.
 */
async function autoPickOnTimeout(leagueId, io) {
  const league = await leagueModel.findById(leagueId);
  if (!league || league.draft_status !== 'in_progress') return;

  const members = await leagueModel.findMembersByLeague(leagueId);
  const picks = await draftPickModel.findByLeague(leagueId);
  const snakeOrder = generateSnakeOrder(league.team_count, league.roster_size);
  const currentPos = getCurrentPickPosition(picks.length, snakeOrder);
  if (currentPos === null) return;

  const onTheClock = members.find((m) => m.draft_position === currentPos);
  if (!onTheClock) return;

  // Pick a random available player (exclude both primary and paired IDs)
  const draftedPlayerIds = picks.flatMap((p) => [p.player_id, p.paired_player_id].filter(Boolean));
  const availableResult = await pool.query(
    `SELECT p.id, tt.is_first_four, tt.first_four_partner_id
     FROM players p
     JOIN tournament_teams tt ON tt.id = p.team_id
     WHERE p.id != ALL($1::uuid[])
     ORDER BY RANDOM() LIMIT 1`,
    [draftedPlayerIds]
  );
  if (availableResult.rows.length === 0) return;

  const chosen = availableResult.rows[0];
  let pairedPlayerId = null;
  if (chosen.is_first_four) {
    const partnerResult = await pool.query(
      `SELECT p.id FROM players p
       WHERE p.team_id = $1 AND p.id != ALL($2::uuid[])
       ORDER BY RANDOM() LIMIT 1`,
      [chosen.first_four_partner_id, draftedPlayerIds]
    );
    pairedPlayerId = partnerResult.rows[0]?.id || null;
  }

  const playerId = chosen.id;
  const pick = await makePick(leagueId, onTheClock.user_id, playerId, pairedPlayerId);

  if (io) {
    io.to(`league:${leagueId}`).emit('draft:pick', {
      pick_number: pick.pick_number,
      player_id: pick.player_id,
      paired_player_id: pick.paired_player_id,
      member_id: pick.member_id,
      draft_position: pick.draft_position,
      auto_picked: true,
    });

    if (pick.draft_status === 'completed') {
      io.to(`league:${leagueId}`).emit('draft:complete', {});
      clearDraftTimer(leagueId);
    } else if (pick.next_turn) {
      io.to(`league:${leagueId}`).emit('draft:turn', pick.next_turn);
    }
  }

  // Continue auto-picking bots, then start timer for next human
  if (pick.draft_status !== 'completed') {
    await autoPick(leagueId, io);
    // Start timer for next human turn
    const updatedLeague = await leagueModel.findById(leagueId);
    if (updatedLeague && updatedLeague.draft_status === 'in_progress') {
      startDraftTimer(leagueId, updatedLeague.draft_timer_seconds ?? 90, io);
    }
  }
}

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * Builds the full snake draft order as a flat array of draft positions.
 * e.g. generateSnakeOrder(4, 3) → [1,2,3,4, 4,3,2,1, 1,2,3,4]
 */
function generateSnakeOrder(teamCount, rosterSize) {
  const order = [];
  for (let round = 0; round < rosterSize; round++) {
    if (round % 2 === 0) {
      for (let pos = 1; pos <= teamCount; pos++) order.push(pos);
    } else {
      for (let pos = teamCount; pos >= 1; pos--) order.push(pos);
    }
  }
  return order;
}

/**
 * Returns the draft position that is currently on the clock,
 * or null if the draft is complete.
 */
function getCurrentPickPosition(totalPicksMade, snakeOrder) {
  if (totalPicksMade >= snakeOrder.length) return null;
  return snakeOrder[totalPicksMade];
}

/** Returns true when all roster slots have been filled. */
function isDraftComplete(totalPicks, teamCount, rosterSize) {
  return totalPicks >= teamCount * rosterSize;
}

// ─── Service functions ────────────────────────────────────────────────────────

async function startDraft(leagueId, userId) {
  const league = await leagueModel.findById(leagueId);
  if (!league) { const e = new Error('League not found'); e.status = 404; throw e; }

  if (league.commissioner_id !== userId) {
    const e = new Error('Only the commissioner can start the draft'); e.status = 403; throw e;
  }
  if (league.draft_status !== 'pre_draft') {
    const e = new Error('Draft has already started'); e.status = 400; throw e;
  }

  const members = await leagueModel.findMembersByLeague(leagueId);
  if (members.length < league.team_count) {
    const e = new Error(`League is not full (${members.length}/${league.team_count})`);
    e.status = 400; throw e;
  }

  // Randomly shuffle members to determine draft order (Fisher-Yates)
  const shuffled = [...members];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const assignments = shuffled.map((m, i) => ({ memberId: m.id, position: i + 1 }));
  await leagueModel.setMemberDraftPositions(assignments);
  await leagueModel.setDraftStatus(leagueId, 'in_progress');

  // Build the draft_order response: [{member_id, user_id, username, draft_position}]
  const draft_order = assignments.map((a) => {
    const member = members.find((m) => m.id === a.memberId);
    return {
      member_id:      member.id,
      user_id:        member.user_id,
      username:       member.username,
      draft_position: a.position,
    };
  }).sort((a, b) => a.draft_position - b.draft_position);

  return { draft_status: 'in_progress', draft_order, draft_timer_seconds: league.draft_timer_seconds ?? 90 };
}

async function makePick(leagueId, userId, playerId, pairedPlayerId = null) {
  // Read members outside the transaction (league_members don't change during a pick)
  const members = await leagueModel.findMembersByLeague(leagueId);

  // Validate First Four pairing requirements before entering transaction
  const player = await playerModel.findById(playerId);
  if (!player) { const e = new Error('Player not found'); e.status = 404; throw e; }

  const team = await tournamentTeamModel.findById(player.team_id);
  if (team && team.is_first_four) {
    if (!pairedPlayerId) {
      const e = new Error('First Four player requires a paired player from the partner team'); e.status = 400; throw e;
    }
    const pairedPlayer = await playerModel.findById(pairedPlayerId);
    if (!pairedPlayer) { const e = new Error('Paired player not found'); e.status = 404; throw e; }
    if (pairedPlayer.team_id !== team.first_four_partner_id) {
      const e = new Error('Paired player must be from the First Four partner team'); e.status = 400; throw e;
    }
  } else if (pairedPlayerId) {
    const e = new Error('Cannot pair a player who is not in the First Four'); e.status = 400; throw e;
  }

  const client = await pool.connect();
  let pick, onTheClock, snakeOrder, pickNumber, complete;

  try {
    await client.query('BEGIN');

    // Lock the league row for the duration of the transaction.
    const leagueResult = await client.query(
      'SELECT * FROM leagues WHERE id = $1 FOR UPDATE',
      [leagueId]
    );
    const league = leagueResult.rows[0];
    if (!league) { const e = new Error('League not found'); e.status = 404; throw e; }

    if (league.draft_status === 'completed') {
      const e = new Error('Draft is already complete'); e.status = 400; throw e;
    }
    if (league.draft_status !== 'in_progress') {
      const e = new Error('Draft has not started'); e.status = 400; throw e;
    }

    const countResult = await client.query(
      'SELECT COUNT(*) FROM draft_picks WHERE league_id = $1',
      [leagueId]
    );
    const picksMade = parseInt(countResult.rows[0].count, 10);

    snakeOrder = generateSnakeOrder(league.team_count, league.roster_size);
    const currentPos = getCurrentPickPosition(picksMade, snakeOrder);

    if (currentPos === null) {
      const e = new Error('Draft is already complete'); e.status = 400; throw e;
    }

    onTheClock = members.find((m) => m.draft_position === currentPos);
    if (!onTheClock || onTheClock.user_id !== userId) {
      const e = new Error('It is not your turn'); e.status = 403; throw e;
    }

    // Check primary player not already drafted (as primary or paired)
    const dupResult = await client.query(
      'SELECT 1 FROM draft_picks WHERE league_id = $1 AND (player_id = $2 OR paired_player_id = $2)',
      [leagueId, playerId]
    );
    if (dupResult.rowCount > 0) {
      const e = new Error('Player has already been drafted'); e.status = 400; throw e;
    }

    // Check paired player not already drafted
    if (pairedPlayerId) {
      const dupPairedResult = await client.query(
        'SELECT 1 FROM draft_picks WHERE league_id = $1 AND (player_id = $2 OR paired_player_id = $2)',
        [leagueId, pairedPlayerId]
      );
      if (dupPairedResult.rowCount > 0) {
        const e = new Error('Paired player has already been drafted'); e.status = 400; throw e;
      }
    }

    pickNumber = picksMade + 1;
    const round = Math.ceil(pickNumber / league.team_count);

    const pickResult = await client.query(
      `INSERT INTO draft_picks (league_id, member_id, player_id, pick_number, round, paired_player_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [leagueId, onTheClock.id, playerId, pickNumber, round, pairedPlayerId]
    );
    pick = pickResult.rows[0];

    complete = isDraftComplete(pickNumber, league.team_count, league.roster_size);
    if (complete) {
      await client.query(
        `UPDATE leagues SET draft_status = 'completed' WHERE id = $1`,
        [leagueId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Determine next drafter (null if complete) — outside the transaction
  let nextDrafter = null;
  if (!complete) {
    const nextPos = getCurrentPickPosition(pickNumber, snakeOrder);
    const nextMember = members.find((m) => m.draft_position === nextPos);
    if (nextMember) {
      nextDrafter = { user_id: nextMember.user_id, username: nextMember.username, draft_position: nextPos };
    }
  }

  return {
    ...pick,
    draft_position: onTheClock.draft_position,
    draft_status:   complete ? 'completed' : 'in_progress',
    next_turn:      nextDrafter,
  };
}

async function getDraftState(leagueId) {
  const league  = await leagueModel.findById(leagueId);
  if (!league) { const e = new Error('League not found'); e.status = 404; throw e; }

  const members    = await leagueModel.findMembersByLeague(leagueId);
  const picks      = await draftPickModel.findByLeague(leagueId);
  const { total: availablePlayersCount } = await playerModel.findAll({ limit: 1 });

  let current_turn = null;
  if (league.draft_status === 'in_progress') {
    const snakeOrder = generateSnakeOrder(league.team_count, league.roster_size);
    const currentPos = getCurrentPickPosition(picks.length, snakeOrder);
    if (currentPos !== null) {
      const onTheClock = members.find((m) => m.draft_position === currentPos);
      if (onTheClock) {
        current_turn = {
          pick_number:    picks.length + 1,
          member_id:      onTheClock.id,
          user_id:        onTheClock.user_id,
          username:       onTheClock.username,
          draft_position: currentPos,
        };
      }
    }
  }

  // Count total drafted player IDs (primary + paired)
  const draftedCount = picks.reduce((n, p) => n + 1 + (p.paired_player_id ? 1 : 0), 0);

  return {
    status:                   league.draft_status,
    picks,
    current_turn,
    available_players_count:  availablePlayersCount - draftedCount,
  };
}

/**
 * Auto-pick loop: while the current turn belongs to a bot, make a random pick
 * and emit socket events. Stops when a human's turn or the draft is complete.
 */
async function autoPick(leagueId, io) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const league = await leagueModel.findById(leagueId);
    if (!league || league.draft_status !== 'in_progress') break;

    const members = await leagueModel.findMembersByLeague(leagueId);
    const picks = await draftPickModel.findByLeague(leagueId);
    const snakeOrder = generateSnakeOrder(league.team_count, league.roster_size);
    const currentPos = getCurrentPickPosition(picks.length, snakeOrder);

    if (currentPos === null) break;

    const onTheClock = members.find((m) => m.draft_position === currentPos);
    if (!onTheClock || !onTheClock.is_bot) break; // human's turn — stop

    // Pick a random available player (exclude both primary and paired IDs)
    const draftedPlayerIds = picks.flatMap((p) => [p.player_id, p.paired_player_id].filter(Boolean));
    const availableResult = await pool.query(
      `SELECT p.id, tt.is_first_four, tt.first_four_partner_id
       FROM players p
       JOIN tournament_teams tt ON tt.id = p.team_id
       WHERE p.id != ALL($1::uuid[])
       ORDER BY RANDOM() LIMIT 1`,
      [draftedPlayerIds]
    );

    if (availableResult.rows.length === 0) break; // no players left

    const chosen = availableResult.rows[0];
    let pairedPlayerId = null;
    if (chosen.is_first_four) {
      const partnerResult = await pool.query(
        `SELECT p.id FROM players p
         WHERE p.team_id = $1 AND p.id != ALL($2::uuid[])
         ORDER BY RANDOM() LIMIT 1`,
        [chosen.first_four_partner_id, draftedPlayerIds]
      );
      pairedPlayerId = partnerResult.rows[0]?.id || null;
    }

    const playerId = chosen.id;

    // Use makePick with the bot's user_id
    const pick = await makePick(leagueId, onTheClock.user_id, playerId, pairedPlayerId);

    // Emit socket events
    if (io) {
      io.to(`league:${leagueId}`).emit('draft:pick', {
        pick_number:    pick.pick_number,
        player_id:      pick.player_id,
        paired_player_id: pick.paired_player_id,
        member_id:      pick.member_id,
        draft_position: pick.draft_position,
      });

      if (pick.draft_status === 'completed') {
        io.to(`league:${leagueId}`).emit('draft:complete', {});
        break;
      } else if (pick.next_turn) {
        io.to(`league:${leagueId}`).emit('draft:turn', pick.next_turn);
      }
    }

    if (pick.draft_status === 'completed') break;
  }
}

module.exports = {
  generateSnakeOrder,
  getCurrentPickPosition,
  isDraftComplete,
  startDraft,
  makePick,
  getDraftState,
  autoPick,
  startDraftTimer,
  clearDraftTimer,
  pauseDraftTimer,
  resumeDraftTimer,
  getDraftTimerState,
};
