import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/leagueService');
import * as leagueService from '../services/leagueService';

import Navbar from './Navbar';

const mockLogout = vi.fn();

function renderNavbar(user = { id: 'u1', username: 'alice', email: 'alice@test.com' }) {
  return render(
    <AuthContext.Provider value={{ user, token: 'tok', logout: mockLogout }}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  leagueService.getLeagues.mockResolvedValue([]);
});

describe('Navbar', () => {
  it('shows a link to the dashboard as the app logo/name', () => {
    renderNavbar();
    const link = screen.getByRole('link', { name: /mm\s*fantasy/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it("shows the current user's username", () => {
    renderNavbar({ id: 'u1', username: 'alice', email: 'alice@test.com' });
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('calls logout when the logout menu item is clicked', async () => {
    renderNavbar();
    // Open the user dropdown (button with the username)
    const userButton = screen.getByText('alice').closest('button');
    await userEvent.click(userButton);
    // Click the logout menu item
    const logoutItem = await screen.findByText(/logout/i);
    await userEvent.click(logoutItem);
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('shows a league switcher dropdown when the user belongs to leagues', async () => {
    leagueService.getLeagues.mockResolvedValue([
      { id: 'lg-1', name: 'March Madness 2025' },
      { id: 'lg-2', name: 'Office Pool' },
    ]);
    renderNavbar();
    // Wait for leagues to load, then open the "My Leagues" dropdown
    const trigger = await screen.findByText('My Leagues');
    expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);
    expect(await screen.findByText('March Madness 2025')).toBeInTheDocument();
    expect(await screen.findByText('Office Pool')).toBeInTheDocument();
  });

  it('does not show the league switcher when the user has no leagues', async () => {
    leagueService.getLeagues.mockResolvedValue([]);
    renderNavbar();
    await waitFor(() => {
      expect(screen.queryByText('My Leagues')).not.toBeInTheDocument();
    });
  });
});
