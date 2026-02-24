import api from './api';

export async function getLeagues() {
  const res = await api.get('/api/leagues');
  return res.data;
}

export async function getLeague(id) {
  const res = await api.get(`/api/leagues/${id}`);
  return res.data;
}

export async function createLeague(name, teamCount, rosterSize) {
  const res = await api.post('/api/leagues', {
    name,
    team_count: teamCount,
    roster_size: rosterSize,
  });
  return res.data;
}

export async function joinLeague(inviteCode) {
  const res = await api.post('/api/leagues/join', { invite_code: inviteCode });
  return res.data;
}

export async function updateLeague(id, data) {
  const res = await api.put(`/api/leagues/${id}`, data);
  return res.data;
}

export async function fillWithBots(id) {
  const res = await api.post(`/api/leagues/${id}/fill-bots`);
  return res.data;
}
