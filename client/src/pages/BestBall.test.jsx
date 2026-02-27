import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BestBall from './BestBall';
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
  lock_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
};

function renderHub() {
  return render(
    <AuthContext.Provider value={{ user: mockUser, token: 'fake-token' }}>
      <MemoryRouter>
        <BestBall />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BestBall Hub', () => {
  it('renders contest info', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getMyLineup.mockResolvedValue(null);

    renderHub();

    await waitFor(() => {
      expect(screen.getByText('March Madness 2025')).toBeInTheDocument();
    });
    expect(screen.getByText('$8,000')).toBeInTheDocument();
  });

  it('shows enter button when not entered', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getMyLineup.mockResolvedValue(null);

    renderHub();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enter contest/i })).toBeInTheDocument();
    });
  });

  it('shows lineup info when entered', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getMyLineup.mockResolvedValue({
      id: 'entry-1',
      budget_remaining: 6000,
      is_complete: false,
      roster: [{ player_id: 'p1' }, { player_id: 'p2' }],
    });

    renderHub();

    await waitFor(() => {
      expect(screen.getByText('Your Lineup')).toBeInTheDocument();
    });
    expect(screen.getByText('2 / 8 players')).toBeInTheDocument();
  });

  it('shows no contest message when none active', async () => {
    bestBallService.getActiveContest.mockResolvedValue(null);

    renderHub();

    await waitFor(() => {
      expect(screen.getByText(/no active contest/i)).toBeInTheDocument();
    });
  });

  it('shows leaderboard link', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getMyLineup.mockResolvedValue(null);

    renderHub();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /leaderboard/i })).toBeInTheDocument();
    });
  });
});
