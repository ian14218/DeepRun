import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LeagueDetail from './LeagueDetail';
import { AuthContext } from '../context/AuthContext';

vi.mock('../services/leagueService');
vi.mock('../services/standingsService');

import * as leagueService from '../services/leagueService';
import * as standingsService from '../services/standingsService';

const COMMISSIONER_ID = 'user-commissioner';
const MEMBER_ID = 'user-member';

const mockLeague = {
  id: 'league-1',
  name: 'Test League',
  invite_code: 'INVITE01',
  team_count: 8,
  roster_size: 10,
  draft_status: 'pre_draft',
  commissioner_id: COMMISSIONER_ID,
  members: [
    { id: 'm1', user_id: COMMISSIONER_ID, username: 'commissioner', team_name: null },
    { id: 'm2', user_id: MEMBER_ID, username: 'member1', team_name: null },
  ],
};

const mockStandings = [
  {
    member_id: 'm1',
    user_id: COMMISSIONER_ID,
    username: 'commissioner',
    team_name: null,
    total_score: 95,
    active_players: 3,
    eliminated_players: 2,
    players_remaining: 3,
  },
  {
    member_id: 'm2',
    user_id: MEMBER_ID,
    username: 'member1',
    team_name: null,
    total_score: 45,
    active_players: 1,
    eliminated_players: 4,
    players_remaining: 1,
  },
];

function renderLeagueDetail(userId = COMMISSIONER_ID) {
  return render(
    <AuthContext.Provider value={{ user: { id: userId, username: 'testuser' }, token: 'tok' }}>
      <MemoryRouter initialEntries={['/leagues/league-1']}>
        <Routes>
          <Route path="/leagues/:id" element={<LeagueDetail />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  leagueService.getLeague.mockResolvedValue(mockLeague);
  standingsService.getStandings.mockResolvedValue(mockStandings);
});

describe('LeagueDetail page', () => {
  it('shows the league name and draft status', async () => {
    renderLeagueDetail();
    await waitFor(() => {
      expect(screen.getByText('Test League')).toBeInTheDocument();
      expect(screen.getByText(/pre.draft/i)).toBeInTheDocument();
    });
  });

  it('shows the member list', async () => {
    renderLeagueDetail();
    await waitFor(() => {
      expect(screen.getAllByText('commissioner').length).toBeGreaterThan(0);
      expect(screen.getAllByText('member1').length).toBeGreaterThan(0);
    });
  });

  it('shows the invite code to the commissioner', async () => {
    renderLeagueDetail(COMMISSIONER_ID);
    await waitFor(() => {
      expect(screen.getByText('INVITE01')).toBeInTheDocument();
    });
  });

  it('does not show the invite code to a non-commissioner member', async () => {
    renderLeagueDetail(MEMBER_ID);
    await waitFor(() => {
      expect(screen.queryByText('INVITE01')).not.toBeInTheDocument();
    });
  });

  it('shows navigation links to Standings, My Team, Draft, and Scoreboard', async () => {
    renderLeagueDetail();
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /standings/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: /my team/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: /draft/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: /scoreboard/i }).length).toBeGreaterThan(0);
    });
  });

  it('shows how many players the current user has still alive', async () => {
    // commissioner has active_players=3, eliminated_players=2 → 3 of 5 alive
    renderLeagueDetail(COMMISSIONER_ID);
    await waitFor(() => {
      expect(screen.getByText(/3 of 5/i)).toBeInTheDocument();
    });
  });
});
