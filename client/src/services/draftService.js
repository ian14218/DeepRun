import api from './api';

export async function getDraftState(leagueId) {
  const res = await api.get(`/api/leagues/${leagueId}/draft`);
  return res.data;
}

export async function startDraft(leagueId) {
  const res = await api.post(`/api/leagues/${leagueId}/draft/start`);
  return res.data;
}

export async function makePick(leagueId, playerId, pairedPlayerId = null) {
  const body = { player_id: playerId };
  if (pairedPlayerId) body.paired_player_id = pairedPlayerId;
  const res = await api.post(`/api/leagues/${leagueId}/draft/pick`, body);
  return res.data;
}

export async function getFirstFourPartnerPlayers(teamId) {
  const res = await api.get(`/api/players/first-four-partners/${teamId}`);
  return res.data; // { players, partnerTeam }
}

export async function controlDraftTimer(leagueId, action, seconds) {
  const res = await api.post(`/api/leagues/${leagueId}/draft/timer-control`, { action, seconds });
  return res.data;
}

export async function getAvailablePlayers() {
  const res = await api.get('/api/players', { params: { limit: 1000 } });
  return res.data;
}
