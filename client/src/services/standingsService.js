import api from './api';

export async function getStandings(leagueId) {
  const res = await api.get(`/api/leagues/${leagueId}/standings`);
  return res.data;
}

export async function getTeamRoster(leagueId, teamId) {
  const res = await api.get(`/api/leagues/${leagueId}/teams/${teamId}`);
  return res.data;
}

export async function getScoreboard(leagueId) {
  const res = await api.get(`/api/leagues/${leagueId}/scoreboard`);
  return res.data;
}

export async function getMrIrrelevant(leagueId) {
  const res = await api.get(`/api/leagues/${leagueId}/mr-irrelevant`);
  return res.data;
}

export async function getTournamentTeams() {
  const res = await api.get('/api/tournaments/teams');
  return res.data;
}

export async function getBracketLayout() {
  const res = await api.get('/api/tournaments/config/bracket-layout');
  return res.data;
}
