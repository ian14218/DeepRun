import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LeagueSidebar from './LeagueSidebar';

function renderSidebar(leagueId = 'league-123') {
  return render(
    <MemoryRouter>
      <LeagueSidebar leagueId={leagueId} />
    </MemoryRouter>
  );
}

describe('LeagueSidebar', () => {
  it('renders navigation links to all four in-league pages', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /standings/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my team/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /draft/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /scoreboard/i })).toBeInTheDocument();
  });

  it('builds correct hrefs from the leagueId prop', () => {
    renderSidebar('abc-123');
    expect(screen.getByRole('link', { name: /standings/i })).toHaveAttribute('href', '/leagues/abc-123/standings');
    expect(screen.getByRole('link', { name: /my team/i })).toHaveAttribute('href', '/leagues/abc-123/my-team');
    expect(screen.getByRole('link', { name: /draft/i })).toHaveAttribute('href', '/leagues/abc-123/draft');
    expect(screen.getByRole('link', { name: /scoreboard/i })).toHaveAttribute('href', '/leagues/abc-123/scoreboard');
  });
});
