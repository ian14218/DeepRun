import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import PlayerList from './PlayerList';

vi.mock('../services/draftService');
import * as draftService from '../services/draftService';

const mockPlayers = [
  { id: 'p1', name: 'John Smith', team_name: 'Duke', position: 'G', is_eliminated: false },
  { id: 'p2', name: 'Bob Jones', team_name: 'UNC', position: 'F', is_eliminated: false },
  { id: 'p3', name: 'Alice Brown', team_name: 'Duke', position: 'C', is_eliminated: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  draftService.getAvailablePlayers.mockResolvedValue({
    players: mockPlayers,
    total: 3,
    page: 1,
    limit: 500,
  });
});

function renderPlayerList(props = {}) {
  return render(
    <PlayerList
      canPick={true}
      onPick={vi.fn()}
      pickedPlayerIds={[]}
      {...props}
    />
  );
}

describe('PlayerList', () => {
  it('renders available players', async () => {
    renderPlayerList();
    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      expect(screen.getByText('Alice Brown')).toBeInTheDocument();
    });
  });

  it('hides players that have already been drafted', async () => {
    renderPlayerList({ pickedPlayerIds: ['p1'] });
    await waitFor(() => {
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });
  });

  it('filters players by name via the search input', async () => {
    renderPlayerList();
    await waitFor(() => expect(screen.getByText('John Smith')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'bob' } });

    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('filters players by team via the dropdown', async () => {
    renderPlayerList();
    await waitFor(() => expect(screen.getByText('John Smith')).toBeInTheDocument());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'UNC' } });

    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.queryByText('Alice Brown')).not.toBeInTheDocument();
  });

  it('calls onPick with the player id when Pick is clicked', async () => {
    const onPick = vi.fn();
    renderPlayerList({ onPick });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /pick/i })).toHaveLength(3)
    );

    fireEvent.click(screen.getAllByRole('button', { name: /pick/i })[0]);
    expect(onPick).toHaveBeenCalledWith('p1');
  });

  it('disables all Pick buttons when canPick is false', async () => {
    renderPlayerList({ canPick: false });
    await waitFor(() => expect(screen.getByText('John Smith')).toBeInTheDocument());

    screen.getAllByRole('button', { name: /pick/i }).forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
