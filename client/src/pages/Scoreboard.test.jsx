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

const mockUpcomingGame = {
  id: 'game-2',
  home_team: 'Team C',
  away_team: 'Team D',
  status: 'upcoming',
  home_score: 0,
  away_score: 0,
  start_time: '2026-03-20T19:10:00Z',
  tournament_round: 'Round of 64',
  players: [],
};

const mockInProgressGame = {
  id: 'game-3',
  home_team: 'Team E',
  away_team: 'Team F',
  status: 'in_progress',
  status_detail: '7:32 - 2nd',
  home_score: 34,
  away_score: 28,
  tournament_round: 'Round of 64',
  players: [],
};

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

  it('shows formatted start time for upcoming games instead of score', async () => {
    standingsService.getScoreboard.mockResolvedValue([mockUpcomingGame]);
    renderScoreboard();
    await waitFor(() => {
      expect(screen.getByText('Team C')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
      // Should not show "UPCOMING" text
      expect(screen.queryByText('UPCOMING')).not.toBeInTheDocument();
      // Should show a formatted time (contains AM or PM)
      expect(screen.getByText(/[AP]M/)).toBeInTheDocument();
    });
  });

  it('shows status_detail for in-progress games', async () => {
    standingsService.getScoreboard.mockResolvedValue([mockInProgressGame]);
    renderScoreboard();
    await waitFor(() => {
      expect(screen.getByText('Team E')).toBeInTheDocument();
      expect(screen.getByText('7:32 - 2nd')).toBeInTheDocument();
      expect(screen.getByText(/34/)).toBeInTheDocument();
      expect(screen.getByText(/28/)).toBeInTheDocument();
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
