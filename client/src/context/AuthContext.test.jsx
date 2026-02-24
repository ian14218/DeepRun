import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

// Mock the api module
vi.mock('../services/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from '../services/api';

function TestConsumer() {
  const { user, token, login, logout, register } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.username : 'null'}</span>
      <span data-testid="token">{token || 'null'}</span>
      <button onClick={() => login('test@example.com', 'pass')}>login</button>
      <button onClick={() => register('user', 'test@example.com', 'pass')}>register</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AuthContext', () => {
  it('provides null user and token initially', () => {
    renderWithProvider();
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('token').textContent).toBe('null');
  });

  it('login() stores token in localStorage and sets user', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        token: 'fake-jwt-token',
        user: { id: '1', username: 'testuser', email: 'test@example.com' },
      },
    });

    renderWithProvider();
    await act(async () => {
      screen.getByText('login').click();
    });

    expect(localStorage.getItem('token')).toBe('fake-jwt-token');
    expect(screen.getByTestId('user').textContent).toBe('testuser');
    expect(screen.getByTestId('token').textContent).toBe('fake-jwt-token');
  });

  it('logout() removes token from localStorage and clears user', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        token: 'fake-jwt-token',
        user: { id: '1', username: 'testuser', email: 'test@example.com' },
      },
    });

    renderWithProvider();
    await act(async () => {
      screen.getByText('login').click();
    });
    await act(async () => {
      screen.getByText('logout').click();
    });

    expect(localStorage.getItem('token')).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('token').textContent).toBe('null');
  });

  it('restores user from localStorage on mount if token is present', () => {
    localStorage.setItem('token', 'existing-token');
    localStorage.setItem(
      'user',
      JSON.stringify({ id: '1', username: 'cached', email: 'c@c.com' })
    );
    renderWithProvider();
    expect(screen.getByTestId('user').textContent).toBe('cached');
    expect(screen.getByTestId('token').textContent).toBe('existing-token');
  });
});
