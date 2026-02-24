import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/standingsService');
vi.mock('../services/leagueService');

import * as standingsService from '../services/standingsService';
import * as leagueService from '../services/leagueService';

import MyTeam from './MyTeam';
import TeamRoster from './TeamRoster';

const USER_ID = 'user-alice';
const MEMBER_ID = 'member-alice';

const mockLeague = {
  id: 'league-1',
  name: 'Test League',
  commissioner_id: USER_ID,
  team_count: 4,
  roster_size: 4,
  members: [
    { id: MEMBER_ID, user_id: USER_ID, username: 'alice' },
    { id: 'member-bob', user_id: 'user-bob', username: 'bob' },
  ],
};

const mockRoster = [
  {
    player_id: 'p1',
    name: 'Star Player',
    team_name: 'Blue Devils',
    position: 'G',
    seed: 1,
    region: 'East',
    is_eliminated: false,
    total_points: 35,
    pick_number: 1,
    points_by_round: { 'Round of 64': 20, 'Round of 32': 15 },
  },
  {
    player_id: 'p2',
    name: 'Good Player',
    team_name: 'Blue Devils',
    position: 'F',
    seed: 1,
    region: 'East',
    is_eliminated: false,
    total_points: 22,
    pick_number: 4,
    points_by_round: { 'Round of 64': 10, 'Round of 32': 12 },
  },
  {
    player_id: 'p3',
    name: 'Elim Player',
    team_name: 'Small College',
    position: 'C',
    seed: 16,
    region: 'West',
    is_eliminated: true,
    total_points: 8,
    pick_number: 3,
    points_by_round: { 'Round of 64': 8 },
  },
];

function renderMyTeam(userId = USER_ID) {
  return render(
    <AuthContext.Provider value={{ user: { id: userId, username: 'alice' }, token: 'tok' }}>
      <MemoryRouter initialEntries={['/leagues/league-1/my-team']}>
        <Routes>
          <Route path="/leagues/:id/my-team" element={<MyTeam />} />
          <Route path="/leagues/:id/team/:memberId" element={<TeamRoster />} />
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

describe('MyTeam page', () => {
  it('lists all drafted players with their total points', async () => {
    renderMyTeam();
    await waitFor(() => {
      expect(screen.getByText('Star Player')).toBeInTheDocument();
      expect(screen.getByText('Good Player')).toBeInTheDocument();
      expect(screen.getByText('Elim Player')).toBeInTheDocument();
      expect(screen.getByText('35')).toBeInTheDocument();
    });
  });

  it('shows active players before eliminated players', async () => {
    renderMyTeam();
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // first data row = Star Player (active), last = Elim Player (eliminated)
      expect(rows[1]).toHaveTextContent('Star Player');
      expect(rows[3]).toHaveTextContent('Elim Player');
    });
  });

  it('shows an "Eliminated" badge on eliminated players', async () => {
    renderMyTeam();
    await waitFor(() => {
      const badges = screen.getAllByText(/eliminated/i);
      // At least one badge (the column header + player badge)
      expect(badges.length).toBeGreaterThanOrEqual(1);
      // The badge near Elim Player row
      expect(screen.getByTestId('elim-badge-p3')).toBeInTheDocument();
    });
  });

  it('shows per-round point breakdown for each player', async () => {
    renderMyTeam();
    await waitFor(() => {
      // Star Player has 20 pts in R64 and 15 in R32
      expect(screen.getByTestId('round-p1-Round of 64')).toHaveTextContent('20');
      expect(screen.getByTestId('round-p1-Round of 32')).toHaveTextContent('15');
    });
  });

  it('shows a summary of how many players are still alive', async () => {
    renderMyTeam();
    await waitFor(() => {
      // 2 active out of 3 total
      expect(screen.getByText(/2 of 3 alive/i)).toBeInTheDocument();
    });
  });
});
