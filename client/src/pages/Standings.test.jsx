import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/standingsService');
import * as standingsService from '../services/standingsService';

import Standings from './Standings';

const mockStandings = [
  {
    member_id: 'member-1',
    user_id: 'user-1',
    username: 'alice',
    team_name: 'Team Alpha',
    total_score: 95,
    active_players: 3,
    eliminated_players: 2,
    players_remaining: 3,
  },
  {
    member_id: 'member-2',
    user_id: 'user-2',
    username: 'bob',
    team_name: null,
    total_score: 45,
    active_players: 1,
    eliminated_players: 4,
    players_remaining: 1,
  },
];

function renderStandings() {
  return render(
    <AuthContext.Provider value={{ user: { id: 'user-1', username: 'alice' }, token: 'tok' }}>
      <MemoryRouter initialEntries={['/leagues/league-1/standings']}>
        <Routes>
          <Route path="/leagues/:id/standings" element={<Standings />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  standingsService.getStandings.mockResolvedValue(mockStandings);
  standingsService.getMrIrrelevant.mockResolvedValue([]);
});

describe('Standings page', () => {
  it('renders team names and total scores sorted by points', async () => {
    renderStandings();
    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      expect(screen.getByText('bob')).toBeInTheDocument(); // team_name is null, falls back to username
    });
    // First row should be rank 1 (highest score)
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('95');
    expect(rows[2]).toHaveTextContent('2');
    expect(rows[2]).toHaveTextContent('45');
  });

  it('shows active_players, eliminated_players, and players_remaining columns', async () => {
    renderStandings();
    await waitFor(() => {
      // alice: 3 active, 2 eliminated, 3 remaining
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('3'); // active
      expect(rows[1]).toHaveTextContent('2'); // eliminated
    });
  });

  it('renders a column header for each standings field', async () => {
    renderStandings();
    await waitFor(() => {
      // Use columnheader role to avoid matching data cells that contain the same words
      expect(screen.getByRole('columnheader', { name: /^team$/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /points/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /active/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /eliminated/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /remaining/i })).toBeInTheDocument();
    });
  });

  it('shows a back link to the league page', async () => {
    renderStandings();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument();
    });
  });
});
