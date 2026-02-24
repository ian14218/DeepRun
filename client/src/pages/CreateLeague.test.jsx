import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CreateLeague from './CreateLeague';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/leagueService');
import * as leagueService from '../services/leagueService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderCreateLeague() {
  return render(
    <AuthContext.Provider value={{ user: { id: 'u1' }, token: 'tok' }}>
      <MemoryRouter>
        <CreateLeague />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('CreateLeague page', () => {
  it('renders name, team count, and roster size fields plus a submit button', () => {
    renderCreateLeague();
    expect(screen.getByLabelText(/league name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/team count/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/roster size/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create league/i })).toBeInTheDocument();
  });

  it('calls createLeague and navigates to league detail on success', async () => {
    const user = userEvent.setup();
    leagueService.createLeague.mockResolvedValue({ id: 'new-league-id', name: 'My League' });
    renderCreateLeague();

    await user.clear(screen.getByLabelText(/league name/i));
    await user.type(screen.getByLabelText(/league name/i), 'My League');
    await user.clear(screen.getByLabelText(/team count/i));
    await user.type(screen.getByLabelText(/team count/i), '8');
    await user.click(screen.getByRole('button', { name: /create league/i }));

    await waitFor(() => {
      expect(leagueService.createLeague).toHaveBeenCalledWith('My League', 8, expect.any(Number));
      expect(mockNavigate).toHaveBeenCalledWith('/leagues/new-league-id');
    });
  });

  it('shows a validation error when team count is less than 4', async () => {
    const user = userEvent.setup();
    renderCreateLeague();

    await user.clear(screen.getByLabelText(/team count/i));
    await user.type(screen.getByLabelText(/team count/i), '3');
    await user.type(screen.getByLabelText(/league name/i), 'Bad League');
    await user.click(screen.getByRole('button', { name: /create league/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(leagueService.createLeague).not.toHaveBeenCalled();
  });

  it('shows a validation error when team count is greater than 20', async () => {
    const user = userEvent.setup();
    renderCreateLeague();

    await user.clear(screen.getByLabelText(/team count/i));
    await user.type(screen.getByLabelText(/team count/i), '21');
    await user.type(screen.getByLabelText(/league name/i), 'Bad League');
    await user.click(screen.getByRole('button', { name: /create league/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(leagueService.createLeague).not.toHaveBeenCalled();
  });
});
