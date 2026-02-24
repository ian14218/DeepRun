import api from './api';

export async function getDraftState(leagueId) {
  const res = await api.get(`/api/leagues/${leagueId}/draft`);
  return res.data;
}

export async function startDraft(leagueId) {
  const res = await api.post(`/api/leagues/${leagueId}/draft/start`);
  return res.data;
}

export async function makePick(leagueId, playerId) {
  const res = await api.post(`/api/leagues/${leagueId}/draft/pick`, { player_id: playerId });
  return res.data;
}

export async function controlDraftTimer(leagueId, action, seconds) {
  const res = await api.post(`/api/leagues/${leagueId}/draft/timer-control`, { action, seconds });
  return res.data;
}

export async function getAvailablePlayers() {
  const res = await api.get('/api/players', { params: { limit: 1000 } });
  return res.data;
}
