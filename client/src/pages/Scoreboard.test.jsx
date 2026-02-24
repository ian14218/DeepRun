import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/standingsService');
vi.mock('../services/leagueService');

import * as standingsService from '../services/standingsService';
import * as leagueService from '../services/leagueService';

import Scoreboard from './Scoreboard';

const USER_ID = 'user-alice';
const MEMBER_ID = 'member-alice';

const mockLeague = {
  id: 'league-1',
  name: 'Test League',
  members: [{ id: MEMBER_ID, user_id: USER_ID, username: 'alice' }],
};

// User drafted p1 (Star Player) — p2 is someone else's player
const mockRoster = [
  { player_id: 'p1', name: 'Star Player', is_eliminated: false, total_points: 35 },
];

const mockGames = [
  {
    id: 'game-1',
    home_team: 'Team A',
    away_team: 'Team B',
    status: 'final',
    home_score: 72,
    away_score: 68,
    tournament_round: 'Round of 64',
    players: [
      { player_id: 'p1', name: 'Star Player', team_name: 'Team A', points: 22 },
      { player_id: 'p2', name: 'Other Player', team_name: 'Team B', points: 14 },
    ],
  },
];

function renderScoreboard() {
  return render(
    <AuthContext.Provider value={{ user: { id: USER_ID, username: 'alice' }, token: 'tok' }}>
      <MemoryRouter initialEntries={['/leagues/league-1/scoreboard']}>
        <Routes>
          <Route path="/leagues/:id/scoreboard" element={<Scoreboard />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  leagueService.getLeague.mockResolvedValue(mockLeague);
  standingsService.getTeamRoster.mockResolvedValue(mockRoster);
});

describe('Scoreboard page', () => {
  it('shows "No games today" when the scoreboard is empty', async () => {
    standingsService.getScoreboard.mockResolvedValue([]);
    renderScoreboard();
    await waitFor(() => {
      expect(screen.getByText(/no games today/i)).toBeInTheDocument();
    });
  });

  it('renders team names, score, and status for each game', async () => {
    standingsService.getScoreboard.mockResolvedValue(mockGames);
    renderScoreboard();
    await waitFor(() => {
      expect(screen.getByText('Team A')).toBeInTheDocument();
      expect(screen.getByText('Team B')).toBeInTheDocument();
      expect(screen.getByText(/72/)).toBeInTheDocument();
      expect(screen.getByText(/68/)).toBeInTheDocument();
      expect(screen.getByText(/final/i)).toBeInTheDocument();
    });
  });

  it('highlights drafted players with their points in each game', async () => {
    standingsService.getScoreboard.mockResolvedValue(mockGames);
    renderScoreboard();
    await waitFor(() => {
      const el = screen.getByTestId('drafted-player-p1');
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent('Star Player');
      expect(el).toHaveTextContent('22');
    });
  });

  it('does not highlight non-drafted players', async () => {
    standingsService.getScoreboard.mockResolvedValue(mockGames);
    renderScoreboard();
    await waitFor(() => {
      // p2 is not in the user's roster — no highlight element
      expect(screen.queryByTestId('drafted-player-p2')).not.toBeInTheDocument();
    });
  });

  it('shows a back link to the league page', async () => {
    standingsService.getScoreboard.mockResolvedValue([]);
    renderScoreboard();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument();
    });
  });
});
