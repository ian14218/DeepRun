import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import JoinLeague from './JoinLeague';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/leagueService');
import * as leagueService from '../services/leagueService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderJoinLeague() {
  return render(
    <AuthContext.Provider value={{ user: { id: 'u1' }, token: 'tok' }}>
      <MemoryRouter>
        <JoinLeague />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

function makeApiError(status, message) {
  const err = new Error(message);
  err.response = { status, data: { error: message } };
  return err;
}

beforeEach(() => vi.clearAllMocks());

describe('JoinLeague page', () => {
  it('renders an invite code input and a submit button', () => {
    renderJoinLeague();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join league/i })).toBeInTheDocument();
  });

  it('calls joinLeague and navigates to league detail on success', async () => {
    const user = userEvent.setup();
    leagueService.joinLeague.mockResolvedValue({ league_id: 'league-abc' });
    renderJoinLeague();

    await user.type(screen.getByLabelText(/invite code/i), 'ABCD1234');
    await user.click(screen.getByRole('button', { name: /join league/i }));

    await waitFor(() => {
      expect(leagueService.joinLeague).toHaveBeenCalledWith('ABCD1234');
      expect(mockNavigate).toHaveBeenCalledWith('/leagues/league-abc');
    });
  });

  it('shows error for an invalid invite code (404)', async () => {
    const user = userEvent.setup();
    leagueService.joinLeague.mockRejectedValue(makeApiError(404, 'League not found'));
    renderJoinLeague();

    await user.type(screen.getByLabelText(/invite code/i), 'NOTVALID');
    await user.click(screen.getByRole('button', { name: /join league/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows error when league is full (400)', async () => {
    const user = userEvent.setup();
    leagueService.joinLeague.mockRejectedValue(makeApiError(400, 'League is full'));
    renderJoinLeague();

    await user.type(screen.getByLabelText(/invite code/i), 'FULLCODE');
    await user.click(screen.getByRole('button', { name: /join league/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows error when user is already a member (409)', async () => {
    const user = userEvent.setup();
    leagueService.joinLeague.mockRejectedValue(makeApiError(409, 'Already a member'));
    renderJoinLeague();

    await user.type(screen.getByLabelText(/invite code/i), 'DUPCODE1');
    await user.click(screen.getByRole('button', { name: /join league/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
