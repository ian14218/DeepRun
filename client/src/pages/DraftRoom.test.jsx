import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';

vi.mock('../services/draftService');
vi.mock('../services/leagueService');
vi.mock('../components/DraftBoard', () => ({
  default: ({ picks }) => <div data-testid="draft-board">{picks.length} picks</div>,
}));
vi.mock('../components/PlayerList', () => ({
  default: ({ canPick, onPick }) => (
    <div data-testid="player-list">
      <button data-testid="pick-btn" disabled={!canPick} onClick={() => onPick('player-1')}>
        Pick
      </button>
    </div>
  ),
}));

import DraftRoom from './DraftRoom';
import * as draftService from '../services/draftService';
import * as leagueService from '../services/leagueService';

const COMMISSIONER_ID = 'user-commissioner';
const MEMBER_ID = 'user-member';

const mockLeague = {
  id: 'league-1',
  name: 'Test League',
  commissioner_id: COMMISSIONER_ID,
  team_count: 4,
  roster_size: 2,
  draft_status: 'pre_draft',
};

const mockSocket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };

function renderDraftRoom(userId = COMMISSIONER_ID) {
  return render(
    <AuthContext.Provider value={{ user: { id: userId, username: 'testuser' }, token: 'tok' }}>
      <SocketContext.Provider value={mockSocket}>
        <MemoryRouter initialEntries={['/leagues/league-1/draft']}>
          <Routes>
            <Route path="/leagues/:id/draft" element={<DraftRoom />} />
          </Routes>
        </MemoryRouter>
      </SocketContext.Provider>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  leagueService.getLeague.mockResolvedValue(mockLeague);
});

describe('DraftRoom', () => {
  it('shows "Start Draft" button to the commissioner when draft has not started', async () => {
    draftService.getDraftState.mockResolvedValue({
      status: 'pre_draft',
      picks: [],
      current_turn: null,
      available_players_count: 64,
    });
    renderDraftRoom(COMMISSIONER_ID);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start draft/i })).toBeInTheDocument();
    });
  });

  it('shows a waiting message to a non-commissioner when draft has not started', async () => {
    draftService.getDraftState.mockResolvedValue({
      status: 'pre_draft',
      picks: [],
      current_turn: null,
      available_players_count: 64,
    });
    renderDraftRoom(MEMBER_ID);
    await waitFor(() => {
      expect(screen.getByText(/commissioner will start/i)).toBeInTheDocument();
    });
  });

  it("enables the pick button when it is the user's turn", async () => {
    draftService.getDraftState.mockResolvedValue({
      status: 'in_progress',
      picks: [],
      current_turn: { user_id: COMMISSIONER_ID, username: 'testuser', draft_position: 1 },
      available_players_count: 64,
    });
    renderDraftRoom(COMMISSIONER_ID);
    await waitFor(() => {
      expect(screen.getByTestId('player-list')).toBeInTheDocument();
      expect(screen.getByTestId('pick-btn')).not.toBeDisabled();
    });
  });

  it("shows a waiting message and disables the pick button when it is not the user's turn", async () => {
    draftService.getDraftState.mockResolvedValue({
      status: 'in_progress',
      picks: [],
      current_turn: { user_id: MEMBER_ID, username: 'otherguy', draft_position: 2 },
      available_players_count: 64,
    });
    renderDraftRoom(COMMISSIONER_ID);
    await waitFor(() => {
      expect(screen.getByText(/waiting for otherguy/i)).toBeInTheDocument();
      expect(screen.getByTestId('pick-btn')).toBeDisabled();
    });
  });

  it('shows "Draft Complete!" and a link to My Team when the draft is finished', async () => {
    draftService.getDraftState.mockResolvedValue({
      status: 'completed',
      picks: [
        {
          id: 'pk1',
          pick_number: 1,
          player_id: 'p1',
          player_name: 'John',
          team_name: 'Duke',
          position: 'G',
          username: 'alice',
          draft_position: 1,
        },
      ],
      current_turn: null,
      available_players_count: 0,
    });
    renderDraftRoom(COMMISSIONER_ID);
    await waitFor(() => {
      expect(screen.getByText(/draft complete/i)).toBeInTheDocument();
      // LeagueSidebar also renders a My Team link, so both are valid
      expect(screen.getAllByRole('link', { name: /my team/i }).length).toBeGreaterThan(0);
    });
  });
});
