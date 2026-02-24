const leagueModel = require('../models/league.model');
const userModel = require('../models/user.model');
const { generateInviteCode } = require('../utils/inviteCode');
const { stripHtml } = require('../utils/sanitize');

async function createLeague(name, teamCount, rosterSize, commissionerId) {
  name = stripHtml(name);
  if (teamCount < 4 || teamCount > 20) {
    const err = new Error('team_count must be between 4 and 20');
    err.status = 400;
    throw err;
  }

  // Generate a unique invite code (retry on collision)
  let inviteCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateInviteCode();
    const existing = await leagueModel.findByInviteCode(candidate);
    if (!existing) {
      inviteCode = candidate;
      break;
    }
  }
  if (!inviteCode) throw new Error('Could not generate unique invite code');

  const league = await leagueModel.create(name, teamCount, rosterSize, commissionerId, inviteCode);

  // Auto-add commissioner as first member
  await leagueModel.addMember(league.id, commissionerId);

  return league;
}

async function joinLeague(inviteCode, userId) {
  const league = await leagueModel.findByInviteCode(inviteCode);
  if (!league) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }

  const alreadyMember = await leagueModel.isMember(league.id, userId);
  if (alreadyMember) {
    const err = new Error('Already a member of this league');
    err.status = 409;
    throw err;
  }

  const memberCount = await leagueModel.getMemberCount(league.id);
  if (memberCount >= league.team_count) {
    const err = new Error('League is full');
    err.status = 400;
    throw err;
  }

  const membership = await leagueModel.addMember(league.id, userId);
  return { league_id: league.id, ...membership };
}

async function getLeagueById(id) {
  const league = await leagueModel.findById(id);
  if (!league) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }
  const members = await leagueModel.findMembersByLeague(id);
  return { ...league, members };
}

async function getLeaguesByUser(userId) {
  return leagueModel.findByUserId(userId);
}

async function updateLeague(id, fields, userId) {
  const league = await leagueModel.findById(id);
  if (!league) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }

  if (league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can update league settings');
    err.status = 403;
    throw err;
  }

  if (league.draft_status !== 'pre_draft') {
    const err = new Error('League settings cannot be changed after the draft has started');
    err.status = 400;
    throw err;
  }

  // Only allow safe fields to be updated
  const allowed = ['name', 'team_count', 'roster_size', 'draft_timer_seconds'];
  const safeFields = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) safeFields[key] = fields[key];
  }
  if (safeFields.name) safeFields.name = stripHtml(safeFields.name);

  if (safeFields.team_count !== undefined) {
    if (safeFields.team_count < 4 || safeFields.team_count > 20) {
      const err = new Error('team_count must be between 4 and 20');
      err.status = 400;
      throw err;
    }
  }

  return leagueModel.update(id, safeFields);
}

async function fillWithBots(leagueId, userId) {
  const league = await leagueModel.findById(leagueId);
  if (!league) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }

  if (league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can add bots');
    err.status = 403;
    throw err;
  }

  if (league.draft_status !== 'pre_draft') {
    const err = new Error('Can only add bots before the draft starts');
    err.status = 400;
    throw err;
  }

  const memberCount = await leagueModel.getMemberCount(leagueId);
  const openSlots = league.team_count - memberCount;
  if (openSlots <= 0) {
    const err = new Error('League is already full');
    err.status = 400;
    throw err;
  }

  // Reuse existing bot users not already in this league, then create new ones as needed
  // Fetch more bots than needed so we can filter out ones already in this league
  const existingBots = await userModel.findBotUsers(openSlots + memberCount);
  const members = await leagueModel.findMembersByLeague(leagueId);
  const memberUserIds = new Set(members.map((m) => m.user_id));

  const availableBots = existingBots.filter((b) => !memberUserIds.has(b.id));
  const botsToAdd = [];

  for (let i = 0; i < openSlots; i++) {
    if (i < availableBots.length) {
      botsToAdd.push(availableBots[i]);
    } else {
      // Use UUID suffix to guarantee unique username
      const shortId = require('crypto').randomUUID().slice(0, 6);
      const bot = await userModel.createBotUser(`CPU Bot ${shortId}`);
      botsToAdd.push(bot);
    }
  }

  for (const bot of botsToAdd) {
    await leagueModel.addMember(leagueId, bot.id);
  }

  return leagueModel.findMembersByLeague(leagueId);
}

async function leaveLeague(leagueId, userId) {
  const league = await leagueModel.findById(leagueId);
  if (!league) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }

  if (league.commissioner_id === userId) {
    const err = new Error('The commissioner cannot leave the league');
    err.status = 400;
    throw err;
  }

  if (league.draft_status !== 'pre_draft') {
    const err = new Error('Cannot leave after the draft has started');
    err.status = 400;
    throw err;
  }

  const removed = await leagueModel.removeMember(leagueId, userId);
  if (!removed) {
    const err = new Error('You are not a member of this league');
    err.status = 400;
    throw err;
  }

  return removed;
}

async function removeMemberByCommissioner(leagueId, targetUserId, commissionerId) {
  const league = await leagueModel.findById(leagueId);
  if (!league) {
    const err = new Error('League not found');
    err.status = 404;
    throw err;
  }

  if (league.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can remove members');
    err.status = 403;
    throw err;
  }

  if (league.draft_status !== 'pre_draft') {
    const err = new Error('Cannot remove members after the draft has started');
    err.status = 400;
    throw err;
  }

  if (targetUserId === commissionerId) {
    const err = new Error('The commissioner cannot be removed');
    err.status = 400;
    throw err;
  }

  const removed = await leagueModel.removeMember(leagueId, targetUserId);
  if (!removed) {
    const err = new Error('User is not a member of this league');
    err.status = 400;
    throw err;
  }

  return removed;
}

module.exports = {
  createLeague,
  joinLeague,
  getLeagueById,
  getLeaguesByUser,
  updateLeague,
  fillWithBots,
  leaveLeague,
  removeMemberByCommissioner,
};
