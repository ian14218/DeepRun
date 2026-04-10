const leagueModel = require('../models/league.model');
const userModel = require('../models/user.model');
const { generateInviteCode } = require('../utils/inviteCode');
const { stripHtml } = require('../utils/sanitize');
const { createError } = require('../utils/errors');

async function createLeague(name, teamCount, rosterSize, commissionerId) {
  name = stripHtml(name);
  if (teamCount < 4 || teamCount > 20) {
    throw createError('team_count must be between 4 and 20', 400);
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
    throw createError('League not found', 404);
  }

  const alreadyMember = await leagueModel.isMember(league.id, userId);
  if (alreadyMember) {
    throw createError('Already a member of this league', 409);
  }

  const memberCount = await leagueModel.getMemberCount(league.id);
  if (memberCount >= league.team_count) {
    throw createError('League is full', 400);
  }

  const membership = await leagueModel.addMember(league.id, userId);
  return { league_id: league.id, ...membership };
}

async function getLeagueById(id) {
  const league = await leagueModel.findById(id);
  if (!league) {
    throw createError('League not found', 404);
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
    throw createError('League not found', 404);
  }

  if (league.commissioner_id !== userId) {
    throw createError('Only the commissioner can update league settings', 403);
  }

  if (league.draft_status !== 'pre_draft') {
    throw createError('League settings cannot be changed after the draft has started', 400);
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
      throw createError('team_count must be between 4 and 20', 400);
    }
  }

  return leagueModel.update(id, safeFields);
}

async function fillWithBots(leagueId, userId) {
  const league = await leagueModel.findById(leagueId);
  if (!league) {
    throw createError('League not found', 404);
  }

  if (league.commissioner_id !== userId) {
    throw createError('Only the commissioner can add bots', 403);
  }

  if (league.draft_status !== 'pre_draft') {
    throw createError('Can only add bots before the draft starts', 400);
  }

  const memberCount = await leagueModel.getMemberCount(leagueId);
  const openSlots = league.team_count - memberCount;
  if (openSlots <= 0) {
    throw createError('League is already full', 400);
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
    throw createError('League not found', 404);
  }

  if (league.commissioner_id === userId) {
    throw createError('The commissioner cannot leave the league', 400);
  }

  if (league.draft_status !== 'pre_draft') {
    throw createError('Cannot leave after the draft has started', 400);
  }

  const removed = await leagueModel.removeMember(leagueId, userId);
  if (!removed) {
    throw createError('You are not a member of this league', 400);
  }

  return removed;
}

async function removeMemberByCommissioner(leagueId, targetUserId, commissionerId) {
  const league = await leagueModel.findById(leagueId);
  if (!league) {
    throw createError('League not found', 404);
  }

  if (league.commissioner_id !== commissionerId) {
    throw createError('Only the commissioner can remove members', 403);
  }

  if (league.draft_status !== 'pre_draft') {
    throw createError('Cannot remove members after the draft has started', 400);
  }

  if (targetUserId === commissionerId) {
    throw createError('The commissioner cannot be removed', 400);
  }

  const removed = await leagueModel.removeMember(leagueId, targetUserId);
  if (!removed) {
    throw createError('User is not a member of this league', 400);
  }

  return removed;
}

async function setDraftOrder(leagueId, userId, orderedMemberIds) {
  const league = await leagueModel.findById(leagueId);
  if (!league) {
    throw createError('League not found', 404);
  }

  if (league.commissioner_id !== userId) {
    throw createError('Only the commissioner can set the draft order', 403);
  }

  if (league.draft_status !== 'pre_draft') {
    throw createError('Draft order cannot be changed after the draft has started', 400);
  }

  if (!Array.isArray(orderedMemberIds) || orderedMemberIds.length === 0) {
    throw createError('orderedMemberIds must be a non-empty array', 400);
  }

  const members = await leagueModel.findMembersByLeague(leagueId);
  const memberIdSet = new Set(members.map((m) => m.id));

  // Validate all IDs are actual members and no duplicates
  const seen = new Set();
  for (const mid of orderedMemberIds) {
    if (!memberIdSet.has(mid)) {
      throw createError(`Member ${mid} is not in this league`, 400);
    }
    if (seen.has(mid)) {
      throw createError('Duplicate member ID in order', 400);
    }
    seen.add(mid);
  }

  if (orderedMemberIds.length !== members.length) {
    throw createError(`Must include all ${members.length} members in the order`, 400);
  }

  await leagueModel.setMemberDraftOrder(leagueId, orderedMemberIds);
  await leagueModel.update(leagueId, { custom_draft_order: true });

  // Return updated members with positions
  return leagueModel.findMembersByLeague(leagueId);
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
  setDraftOrder,
};
