import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { AuthContext } from '../context/AuthContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderLogin(authValue = {}) {
  const defaultAuth = {
    login: vi.fn(),
    user: null,
    token: null,
    ...authValue,
  };
  return {
    ...render(
      <AuthContext.Provider value={defaultAuth}>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </AuthContext.Provider>
    ),
    authValue: defaultAuth,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('Login page', () => {
  it('renders email and password fields and a submit button', () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('calls login() and navigates to /dashboard on success', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValueOnce(undefined);
    renderLogin({ login: mockLogin });

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows error message on failed login', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockRejectedValueOnce(new Error('Invalid credentials'));
    renderLogin({ login: mockLogin });

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('has a link to the register page', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
  });
});
