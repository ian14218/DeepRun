import { render, screen } from '@testing-library/react';
import DraftBoard from './DraftBoard';

const mockMembers = [
  { user_id: 'u1', username: 'alice', draft_position: 1 },
  { user_id: 'u2', username: 'bob', draft_position: 2 },
];

// Two picks in round 1; round 2 is intentionally empty to test placeholder cells
const mockPicks = [
  {
    id: 'pk1',
    pick_number: 1,
    round: 1,
    player_name: 'John Smith',
    team_name: 'Duke',
    position: 'G',
    username: 'alice',
    draft_position: 1,
    user_id: 'u1',
  },
  {
    id: 'pk2',
    pick_number: 2,
    round: 1,
    player_name: 'Bob Jones',
    team_name: 'UNC',
    position: 'F',
    username: 'bob',
    draft_position: 2,
    user_id: 'u2',
  },
];

describe('DraftBoard', () => {
  it('renders each pick with player name and team', () => {
    render(<DraftBoard picks={mockPicks} teamCount={2} rosterSize={2} members={mockMembers} />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('organizes picks into a grid with round rows and team columns', () => {
    render(<DraftBoard picks={mockPicks} teamCount={2} rosterSize={2} members={mockMembers} />);
    // Row headers: one cell per round
    expect(screen.getByText('1')).toBeInTheDocument(); // Round 1
    expect(screen.getByText('2')).toBeInTheDocument(); // Round 2
    // Column headers show usernames (both mobile + desktop variants)
    expect(screen.getAllByText('alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bob').length).toBeGreaterThan(0);
  });

  it('shows empty placeholder for each unfilled round/team slot', () => {
    const { container } = render(<DraftBoard picks={mockPicks} teamCount={2} rosterSize={2} members={mockMembers} />);
    // Round 2 has no picks yet — both team columns get a dashed placeholder div
    const placeholders = container.querySelectorAll('.border-dashed');
    expect(placeholders.length).toBe(2);
  });

  it('shows unavailable message when teamCount or rosterSize is 0', () => {
    render(<DraftBoard picks={[]} teamCount={0} rosterSize={0} />);
    expect(screen.getByText(/draft board unavailable/i)).toBeInTheDocument();
  });
});
