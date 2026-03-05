import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/leagueService');
vi.mock('../services/bestBallService');
import * as leagueService from '../services/leagueService';
import * as bestBallService from '../services/bestBallService';

const mockUser = { id: 'user-1', username: 'testuser', email: 'test@example.com' };

function renderDashboard(user = mockUser) {
  return render(
    <AuthContext.Provider value={{ user, token: 'fake-token' }}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  bestBallService.getActiveContest.mockResolvedValue(null);
  bestBallService.getMyLineup.mockResolvedValue(null);
});

describe('Dashboard', () => {
  it('shows Create League and Join League buttons', async () => {
    leagueService.getLeagues.mockResolvedValue([]);
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /create league/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /join league/i })).toBeInTheDocument();
    });
  });

  it('renders a card for each league with name, member count, and draft status', async () => {
    leagueService.getLeagues.mockResolvedValue([
      { id: 'l1', name: 'Alpha League', team_count: 8, draft_status: 'pre_draft', member_count: 3 },
      { id: 'l2', name: 'Beta League',  team_count: 4, draft_status: 'in_progress', member_count: 4 },
    ]);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alpha League')).toBeInTheDocument();
      expect(screen.getByText('Beta League')).toBeInTheDocument();
    });

    expect(screen.getByText(/3/)).toBeInTheDocument();   // member count
    expect(screen.getByText(/pre.draft/i)).toBeInTheDocument();
    expect(screen.getByText(/in.progress/i)).toBeInTheDocument();
  });

  it('shows an empty state when the user has no leagues', async () => {
    leagueService.getLeagues.mockResolvedValue([]);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/no leagues/i)).toBeInTheDocument();
    });
  });
});
