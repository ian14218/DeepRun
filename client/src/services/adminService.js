import api from './api';

export function getAdminStats() {
  return api.get('/api/admin/stats').then((r) => r.data);
}

export function getAdminUsers(search = '', page = 1, limit = 20) {
  return api.get('/api/admin/users', { params: { search, page, limit } }).then((r) => r.data);
}

export function deleteAdminUser(id) {
  return api.delete(`/api/admin/users/${id}`).then((r) => r.data);
}

export function toggleAdminStatus(id, isAdmin) {
  return api.patch(`/api/admin/users/${id}/admin`, { is_admin: isAdmin }).then((r) => r.data);
}

export function getAdminLeagues(search = '', status = '', page = 1, limit = 20) {
  return api.get('/api/admin/leagues', { params: { search, status, page, limit } }).then((r) => r.data);
}

export function getAdminLeagueDetail(id) {
  return api.get(`/api/admin/leagues/${id}`).then((r) => r.data);
}

export function deleteAdminLeague(id) {
  return api.delete(`/api/admin/leagues/${id}`).then((r) => r.data);
}

export function resetAdminDraft(id) {
  return api.post(`/api/admin/leagues/${id}/reset-draft`).then((r) => r.data);
}

export function getAdminTeams() {
  return api.get('/api/admin/tournament/teams').then((r) => r.data);
}

export function getAdminPlayers(search = '', team = '', page = 1, limit = 20) {
  return api.get('/api/admin/tournament/players', { params: { search, team, page, limit } }).then((r) => r.data);
}

export function simulateTournamentRound() {
  return api.post('/api/admin/tournament/simulate-round').then((r) => r.data);
}
