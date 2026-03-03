import api from './api';

export async function getActiveContest() {
  const res = await api.get('/api/best-ball/contests/active');
  return res.data;
}

export async function getContest(contestId) {
  const res = await api.get(`/api/best-ball/contests/${contestId}`);
  return res.data;
}

export async function enterContest(contestId) {
  const res = await api.post(`/api/best-ball/contests/${contestId}/enter`);
  return res.data;
}

export async function getMyLineup(contestId) {
  const res = await api.get(`/api/best-ball/contests/${contestId}/my-lineup`);
  return res.data;
}

export async function getEntryDetail(entryId) {
  const res = await api.get(`/api/best-ball/entries/${entryId}`);
  return res.data;
}

export async function deleteEntry(entryId) {
  const res = await api.delete(`/api/best-ball/entries/${entryId}`);
  return res.data;
}

export async function addPlayer(entryId, playerId, pairedPlayerId = null) {
  const body = { playerId };
  if (pairedPlayerId) body.pairedPlayerId = pairedPlayerId;
  const res = await api.post(`/api/best-ball/entries/${entryId}/players`, body);
  return res.data;
}

export async function removePlayer(entryId, playerId) {
  const res = await api.delete(`/api/best-ball/entries/${entryId}/players/${playerId}`);
  return res.data;
}

export async function getPlayerMarket(contestId, params = {}) {
  const res = await api.get(`/api/best-ball/contests/${contestId}/players`, { params });
  return res.data;
}

export async function getLeaderboard(contestId, params = {}) {
  const res = await api.get(`/api/best-ball/contests/${contestId}/leaderboard`, { params });
  return res.data;
}

// Admin
export async function createContest(data) {
  const res = await api.post('/api/best-ball/admin/contests', data);
  return res.data;
}

export async function updateContestStatus(contestId, status) {
  const res = await api.put(`/api/best-ball/admin/contests/${contestId}/status`, { status });
  return res.data;
}

export async function generatePrices(contestId) {
  const res = await api.post(`/api/best-ball/admin/contests/${contestId}/generate-prices`);
  return res.data;
}

export async function getConfig() {
  const res = await api.get('/api/best-ball/admin/config');
  return res.data;
}

export async function updateConfig(key, value) {
  const res = await api.put(`/api/best-ball/admin/config/${key}`, { value });
  return res.data;
}
