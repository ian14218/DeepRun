import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

// api is used by AuthContext; mock it to avoid real HTTP in this smoke test
vi.mock('./services/api', () => ({
  default: { post: vi.fn(), interceptors: { request: { use: vi.fn() } } },
  setOnUnauthorized: vi.fn(),
}));

// Mock socket.io-client to prevent actual connections in tests
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
  })),
}));

describe('App', () => {
  it('renders login page at /login without crashing', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });
});
