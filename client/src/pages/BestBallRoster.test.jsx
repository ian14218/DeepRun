import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BestBallRoster from './BestBallRoster';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/bestBallService');
import * as bestBallService from '../services/bestBallService';

const mockUser = { id: 'user-1', username: 'testuser', email: 'test@example.com' };

const mockContest = {
  id: 'contest-1',
  name: 'March Madness 2025',
  status: 'open',
  budget: 8000,
  roster_size: 8,
};

const mockEntry = {
  id: 'entry-1',
  contest_id: 'contest-1',
  user_id: 'user-1',
  budget_remaining: 6800,
  is_complete: false,
  roster: [
    {
      player_id: 'p1',
      name: 'John Star',
      team_name: 'Duke',
      seed: 1,
      purchase_price: 1200,
      season_ppg: 22,
    },
  ],
};

const mockMarket = {
  rows: [
    {
      player_id: 'p1',
      name: 'John Star',
      team_name: 'Duke',
      seed: 1,
      price: 1200,
      season_ppg: 22,
    },
    {
      player_id: 'p2',
      name: 'Mike Guard',
      team_name: 'UNC',
      seed: 2,
      price: 900,
      season_ppg: 15,
    },
  ],
  total: 2,
};

function renderRoster() {
  return render(
    <AuthContext.Provider value={{ user: mockUser, token: 'fake-token' }}>
      <MemoryRouter>
        <BestBallRoster />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  bestBallService.getActiveContest.mockResolvedValue(mockContest);
  bestBallService.getMyLineup.mockResolvedValue(mockEntry);
  bestBallService.getPlayerMarket.mockResolvedValue(mockMarket);
});

describe('BestBallRoster', () => {
  it('renders market with player prices', async () => {
    renderRoster();

    await waitFor(() => {
      // John Star appears in both roster panel and market
      expect(screen.getAllByText('John Star').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Mike Guard')).toBeInTheDocument();
    });

    expect(screen.getByText('$900')).toBeInTheDocument();
  });

  it('renders roster panel with budget', async () => {
    renderRoster();

    await waitFor(() => {
      expect(screen.getByText('My Roster')).toBeInTheDocument();
    });

    expect(screen.getByText(/\$6,800/)).toBeInTheDocument();
  });

  it('shows player count in roster', async () => {
    renderRoster();

    await waitFor(() => {
      expect(screen.getByText('1 / 8 players')).toBeInTheDocument();
    });
  });

  it('shows no active contest message', async () => {
    bestBallService.getActiveContest.mockResolvedValue(null);

    renderRoster();

    await waitFor(() => {
      expect(screen.getByText('No active contest')).toBeInTheDocument();
    });
  });

  it('shows not entered message when no entry', async () => {
    bestBallService.getMyLineup.mockResolvedValue(null);

    renderRoster();

    await waitFor(() => {
      expect(screen.getByText(/not entered/i)).toBeInTheDocument();
    });
  });

  it('add button triggers addPlayer service call', async () => {
    bestBallService.addPlayer.mockResolvedValue({ ...mockEntry, budget_remaining: 5900 });

    renderRoster();

    await waitFor(() => {
      expect(screen.getByText('Mike Guard')).toBeInTheDocument();
    });

    // Find the Add button for Mike Guard (not the "Added" one for John Star)
    const addButtons = screen.getAllByRole('button', { name: /^Add$/i });
    expect(addButtons.length).toBeGreaterThan(0);
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(bestBallService.addPlayer).toHaveBeenCalledWith('entry-1', 'p2', null);
    });
  });

  it('disables add for rostered players', async () => {
    renderRoster();

    await waitFor(() => {
      expect(screen.getByText('John Star')).toBeInTheDocument();
    });

    // John Star should have "Added" disabled button
    const addedButton = screen.getByRole('button', { name: /Added/i });
    expect(addedButton).toBeDisabled();
  });

  it('shows read-only when contest is locked', async () => {
    bestBallService.getActiveContest.mockResolvedValue({ ...mockContest, status: 'locked' });

    renderRoster();

    await waitFor(() => {
      expect(screen.getByText('My Lineup')).toBeInTheDocument();
    });

    // Should not have Add buttons
    expect(screen.queryByRole('button', { name: /^Add$/i })).not.toBeInTheDocument();
  });
});
