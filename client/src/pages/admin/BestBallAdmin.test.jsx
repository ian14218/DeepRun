import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BestBallAdmin from './BestBallAdmin';
import { AuthContext } from '../../context/AuthContext';

vi.mock('../../services/bestBallService');
import * as bestBallService from '../../services/bestBallService';

const mockAdmin = { id: 'admin-1', username: 'admin', email: 'admin@example.com', is_admin: true };

function renderAdmin() {
  return render(
    <AuthContext.Provider value={{ user: mockAdmin, token: 'fake-token' }}>
      <MemoryRouter>
        <BestBallAdmin />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  bestBallService.getConfig.mockResolvedValue([
    { key: 'salary_floor', value: '500', description: 'Minimum player price' },
    { key: 'salary_ceiling', value: '1800', description: 'Maximum player price' },
  ]);
});

describe('BestBallAdmin', () => {
  it('shows create form when no active contest', async () => {
    bestBallService.getActiveContest.mockResolvedValue(null);

    renderAdmin();

    await waitFor(() => {
      expect(screen.getByLabelText('Contest Name')).toBeInTheDocument();
    });
  });

  it('shows contest details when active contest exists', async () => {
    bestBallService.getActiveContest.mockResolvedValue({
      id: 'contest-1',
      name: 'March Madness 2025',
      status: 'upcoming',
      budget: 8000,
      roster_size: 8,
      lock_date: '2025-03-20T12:00:00Z',
    });

    renderAdmin();

    await waitFor(() => {
      expect(screen.getByText('March Madness 2025')).toBeInTheDocument();
    });
    expect(screen.getAllByText('upcoming').length).toBeGreaterThanOrEqual(1);
  });

  it('shows pricing config', async () => {
    bestBallService.getActiveContest.mockResolvedValue(null);

    renderAdmin();

    await waitFor(() => {
      expect(screen.getByText('Pricing Config')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1800')).toBeInTheDocument();
  });

  it('shows generate prices button for active contest', async () => {
    bestBallService.getActiveContest.mockResolvedValue({
      id: 'contest-1',
      name: 'Test Contest',
      status: 'upcoming',
      budget: 8000,
      roster_size: 8,
      lock_date: '2025-03-20T12:00:00Z',
    });

    renderAdmin();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate prices/i })).toBeInTheDocument();
    });
  });
});
