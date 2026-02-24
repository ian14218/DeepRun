import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { AuthContext } from '../context/AuthContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderRegister(authValue = {}) {
  const defaultAuth = {
    register: vi.fn(),
    user: null,
    token: null,
    ...authValue,
  };
  return {
    ...render(
      <AuthContext.Provider value={defaultAuth}>
        <MemoryRouter>
          <Register />
        </MemoryRouter>
      </AuthContext.Provider>
    ),
    authValue: defaultAuth,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('Register page', () => {
  it('renders username, email, and password fields and a submit button', () => {
    renderRegister();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('calls register() and navigates to /dashboard on success', async () => {
    const user = userEvent.setup();
    const mockRegister = vi.fn().mockResolvedValueOnce(undefined);
    renderRegister({ register: mockRegister });

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('newuser', 'new@example.com', 'Password123!');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows an error when fields are missing (client-side validation)', async () => {
    const user = userEvent.setup();
    renderRegister();

    // Submit without filling in any fields
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/username is required/i)).toBeInTheDocument();
    });
  });

  it('shows server error when registration fails (e.g. duplicate email)', async () => {
    const user = userEvent.setup();
    const err = new Error('Email already in use');
    err.response = { data: { error: 'Email already in use' } };
    const mockRegister = vi.fn().mockRejectedValueOnce(err);
    renderRegister({ register: mockRegister });

    await user.type(screen.getByLabelText(/username/i), 'user');
    await user.type(screen.getByLabelText(/email/i), 'dup@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('has a link to the login page', () => {
    renderRegister();
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
  });
});
