import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BestBallLeaderboard from './BestBallLeaderboard';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/bestBallService');
import * as bestBallService from '../services/bestBallService';

const mockUser = { id: 'user-1', username: 'testuser', email: 'test@example.com' };

const mockContest = {
  id: 'contest-1',
  name: 'March Madness 2025',
  status: 'live',
};

function renderLeaderboard() {
  return render(
    <AuthContext.Provider value={{ user: mockUser, token: 'fake-token' }}>
      <MemoryRouter>
        <BestBallLeaderboard />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('BestBallLeaderboard', () => {
  it('renders ranked entries', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getLeaderboard.mockResolvedValue({
      rows: [
        { id: 'e1', user_id: 'user-2', username: 'alice', total_score: 150, active_players: 5, eliminated_players: 3 },
        { id: 'e2', user_id: 'user-1', username: 'testuser', total_score: 120, active_players: 6, eliminated_players: 2 },
      ],
      total: 2,
    });

    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.getByText(/testuser/)).toBeInTheDocument();
    });
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('highlights current user', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getLeaderboard.mockResolvedValue({
      rows: [
        { id: 'e1', user_id: 'user-1', username: 'testuser', total_score: 100, active_players: 5, eliminated_players: 3 },
      ],
      total: 1,
    });

    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText(/\(You\)/)).toBeInTheDocument();
    });
  });

  it('shows empty state', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getLeaderboard.mockResolvedValue({ rows: [], total: 0 });

    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText(/no complete entries/i)).toBeInTheDocument();
    });
  });

  it('shows no contest message', async () => {
    bestBallService.getActiveContest.mockResolvedValue(null);

    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText(/no active contest/i)).toBeInTheDocument();
    });
  });

  it('displays contest name', async () => {
    bestBallService.getActiveContest.mockResolvedValue(mockContest);
    bestBallService.getLeaderboard.mockResolvedValue({
      rows: [
        { id: 'e1', user_id: 'user-2', username: 'alice', total_score: 100, active_players: 5, eliminated_players: 3 },
      ],
      total: 1,
    });

    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText('March Madness 2025')).toBeInTheDocument();
    });
  });
});
