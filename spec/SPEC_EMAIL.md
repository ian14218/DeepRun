# DeepRun Email & Password Management — Specification Document

## 1. Overview

This spec adds a transactional email service and self-service password management to DeepRun. Currently, password resets require admin intervention and out-of-band communication. This feature introduces:

1. **Email Service Foundation** — A reusable Nodemailer-based service for sending transactional email.
2. **Forgot Password** — Self-service password reset via emailed token link.
3. **Admin Reset Notification** — Email users their temporary password when an admin resets it.
4. **Welcome Email** — Confirmation email on registration.

### Email Provider Strategy

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Resend SDK (HTTPS API)** | Works on all Railway plans, 3K emails/month free (permanent), official Railway integration, clean API | Vendor-specific SDK, one extra dependency | **Primary — for Railway production** |
| **Nodemailer + SMTP** | Zero vendor lock-in, works with any SMTP provider, 5M+ weekly npm downloads, Ethereal for dev/test | SMTP ports (587/465) blocked on Railway Free/Hobby plans | **Fallback — for non-Railway or Railway Pro** |
| SendGrid SDK | Battle-tested, analytics dashboard | Killed free tier May 2025, complex setup, vendor lock-in | Not recommended |

**Decision**: Build a **dual-transport email service** that supports both the Resend HTTPS API and Nodemailer SMTP. The transport is selected by environment configuration:

- **If `RESEND_API_KEY` is set** → Use the Resend SDK (HTTPS, works on all Railway plans).
- **Else if `SMTP_HOST` is set** → Use Nodemailer SMTP transport (for self-hosted, Gmail, SES, etc.).
- **Else** → Log emails to console (development mode).

This gives Railway users a zero-friction path (Resend), while keeping the implementation provider-agnostic for operators who prefer their own SMTP.

### Railway Production Considerations

- **No native email service** — Railway does not provide built-in email sending. All email goes through external providers.
- **SMTP ports are blocked** — Railway blocks outbound SMTP (ports 25, 465, 587) on Free, Trial, and Hobby plans. Only Pro plan allows SMTP. This is why the Resend HTTPS API is the recommended transport — it uses standard HTTPS (port 443) which works on all plans.
- **Resend free tier** — 3,000 emails/month permanently. For ~100 users sending password resets, admin notifications, and welcome emails, this is more than sufficient (estimated <100 emails/month).
- **Credentials via env vars** — Railway's built-in environment variable system stores API keys securely. Set `RESEND_API_KEY` in Railway's dashboard.
- **Domain verification** — Resend requires verifying your sending domain (SPF/DKIM DNS records) to send from a custom address. For development/testing, Resend provides a shared `onboarding@resend.dev` sender.
- **No email queue needed** — At ~100 users, email volume is trivially low (a few per day at most). Sending synchronously in the request handler is fine. A Bull/Redis queue would be over-engineering. Email sends are fire-and-forget (don't block the HTTP response on send success).
- **Graceful degradation** — If neither `RESEND_API_KEY` nor `SMTP_HOST` is configured, the email service logs the email to console instead of crashing. This allows local development without any email setup and prevents the app from breaking if credentials expire in production.

---

## 2. Dependencies

### New npm Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `resend` | `^4.0.0` | Resend HTTPS email API (primary transport for Railway) |
| `nodemailer` | `^6.9.0` | SMTP email transport (fallback for non-Railway deployments) |

**Install**: `cd server && npm install resend nodemailer`

The `crypto` module used for token generation is built into Node.js (no install needed).

### New Environment Variables

Add to `server/.env.example`:

```
# Email — configure ONE of the two transports (or neither for console logging)
# Option 1: Resend API (recommended for Railway — works on all plans)
RESEND_API_KEY=
# Option 2: SMTP (for self-hosted, Gmail, SES — requires Railway Pro for SMTP ports)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
# Shared config
EMAIL_FROM=DeepRun <noreply@yourdomain.com>
APP_URL=http://localhost:5173
```

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | No | Resend API key. If set, uses Resend HTTPS API (recommended for Railway). |
| `SMTP_HOST` | No | SMTP server hostname (e.g., `smtp.gmail.com`). Used only if `RESEND_API_KEY` is not set. |
| `SMTP_PORT` | No | SMTP port. Default `587`. Use `465` for implicit TLS. |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `EMAIL_FROM` | No | Sender address. Default `DeepRun <noreply@deeprun.app>` |
| `APP_URL` | No | Base URL for links in emails. Default `http://localhost:5173` |

**Transport selection priority**: `RESEND_API_KEY` > `SMTP_HOST` > console logging. If neither is set, the email service operates in "log mode" — it logs the email subject, recipient, and body to console instead of sending. This is the default for local development.

---

## 3. Database Migration

**File**: `database/migrations/014_add_password_reset_tokens.sql`

```sql
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);
```

### Schema Design Decisions

- **`token_hash` (VARCHAR(64))** — We store SHA-256 hashes of the token, never the raw token. If the database is compromised, the attacker cannot use the hashes to reset passwords. The raw token is only ever in the email link and in memory during verification.
- **`ON DELETE CASCADE`** — If a user is deleted, their reset tokens are automatically cleaned up.
- **Unique index on `token_hash`** — Enables fast lookups and prevents hash collisions (astronomically unlikely with SHA-256 but enforced at DB level).
- **`used_at` column** — Tracks token consumption. A token with `used_at IS NOT NULL` is spent. Using a timestamp instead of a boolean provides an audit trail.
- **`expires_at`** — Tokens expire after 1 hour. The application checks `expires_at > NOW()` on verification.
- **No separate `is_valid` column** — Token validity is derived: `used_at IS NULL AND expires_at > NOW()`. This avoids boolean flag drift.

---

## 4. Implementation

### 4.1 Email Service

**File**: `server/src/services/email.service.js`

The email service is a dual-transport wrapper that supports both the Resend HTTPS API and Nodemailer SMTP. All other features call this service — they never interact with transports directly. It handles transport selection, template rendering, and graceful degradation.

#### Architecture

```
email.service.js
├── initTransport()          — Selects transport: Resend API > Nodemailer SMTP > null (console)
├── sendEmail(to, subject, html) — Core send function with graceful fallback
├── sendPasswordReset(email, username, resetUrl)    — Forgot password template
├── sendAdminResetNotification(email, username, temporaryPassword) — Admin reset template
└── sendWelcome(email, username)                    — Welcome template
```

#### Behavior

1. **On module load**: Select transport based on environment:
   - If `RESEND_API_KEY` is set → create a Resend client.
   - Else if `SMTP_HOST` is set → create a Nodemailer SMTP transport.
   - Else → set transport to `null` (console log mode).
2. **`sendEmail(to, subject, html)`**: If transport is `null`, log the email details to console and return `{ sent: false, logged: true }`. If Resend, call `resend.emails.send()`. If Nodemailer, call `transport.sendMail()`. On any send failure, log the error and return `{ sent: false, error }` — never throw. Callers must not crash on email failure.
3. **Template functions**: Each builds an HTML string and calls `sendEmail()`. Templates use inline CSS (no external stylesheet dependency). All user-supplied values (username, etc.) must be HTML-escaped to prevent injection.

#### Transport Configuration

```javascript
const { Resend } = require('resend');
const nodemailer = require('nodemailer');

let transport = null;
let transportType = 'console'; // 'resend' | 'smtp' | 'console'

if (process.env.RESEND_API_KEY) {
  transport = new Resend(process.env.RESEND_API_KEY);
  transportType = 'resend';
} else if (process.env.SMTP_HOST) {
  const secure = parseInt(process.env.SMTP_PORT) === 465;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  transportType = 'smtp';
}
```

#### `sendEmail()` Implementation

```javascript
async function sendEmail(to, subject, html) {
  const from = process.env.EMAIL_FROM || 'DeepRun <noreply@deeprun.app>';

  if (transportType === 'console') {
    console.log(`[email] To: ${to} | Subject: ${subject}`);
    console.log(`[email] Body: ${html}`);
    return { sent: false, logged: true };
  }

  try {
    if (transportType === 'resend') {
      await transport.emails.send({ from, to, subject, html });
    } else {
      await transport.sendMail({ from, to, subject, html });
    }
    return { sent: true };
  } catch (error) {
    console.error(`[email] Failed to send to ${to}:`, error.message);
    return { sent: false, error: error.message };
  }
}
```

#### Acceptance Criteria

- AC-EMAIL-1: When `RESEND_API_KEY` is configured, `sendEmail()` sends via Resend HTTPS API and returns `{ sent: true }`.
- AC-EMAIL-1b: When `SMTP_HOST` is configured (and no `RESEND_API_KEY`), `sendEmail()` sends via SMTP and returns `{ sent: true }`.
- AC-EMAIL-2: When neither `RESEND_API_KEY` nor `SMTP_HOST` is configured, `sendEmail()` logs to console and returns `{ sent: false, logged: true }`.
- AC-EMAIL-3: When SMTP send fails (network error, bad credentials), `sendEmail()` logs the error and returns `{ sent: false, error }` — it never throws.
- AC-EMAIL-4: User-supplied values in email templates are HTML-escaped.
- AC-EMAIL-5: All template functions (`sendPasswordReset`, `sendAdminResetNotification`, `sendWelcome`) call `sendEmail()` and return its result.

#### Tests

**File**: `server/tests/email.test.js`

All tests mock both Resend SDK and Nodemailer's `createTransport` — no real API calls or SMTP connections in tests. Use `jest.mock('resend')` and `jest.mock('nodemailer')`.

- `sendEmail()` with `RESEND_API_KEY` configured calls `resend.emails.send()` with correct `from`, `to`, `subject`, `html` fields.
- `sendEmail()` with `RESEND_API_KEY` configured returns `{ sent: true }` on success.
- `sendEmail()` with `SMTP_HOST` configured (no `RESEND_API_KEY`) calls `transport.sendMail` with correct fields.
- `sendEmail()` with `SMTP_HOST` configured returns `{ sent: true }` on success.
- `sendEmail()` with neither configured logs to console and returns `{ sent: false, logged: true }`.
- `sendEmail()` when Resend API rejects returns `{ sent: false, error }` and does not throw.
- `sendEmail()` when `transport.sendMail` rejects returns `{ sent: false, error }` and does not throw.
- `RESEND_API_KEY` takes precedence over `SMTP_HOST` when both are set.
- `sendPasswordReset()` produces HTML containing the reset URL and username.
- `sendAdminResetNotification()` produces HTML containing the temporary password and username.
- `sendWelcome()` produces HTML containing the username.
- Template functions HTML-escape `<script>` tags in username input (XSS prevention).

---

### 4.2 Password Reset Token Model

**File**: `server/src/models/passwordResetToken.model.js`

Raw SQL via `pg` pool, following the existing model pattern.

#### Functions

| Function | SQL | Returns |
|----------|-----|---------|
| `create(userId, tokenHash, expiresAt)` | `INSERT INTO password_reset_tokens` | Created row |
| `findValidByHash(tokenHash)` | `SELECT ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()` | Row or `null` |
| `markUsed(id)` | `UPDATE ... SET used_at = NOW() WHERE id = $1` | Updated row |
| `invalidateForUser(userId)` | `UPDATE ... SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL` | Count of invalidated tokens |
| `deleteExpired()` | `DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '7 days'` | Count of deleted rows |

#### Design Decisions

- **`invalidateForUser()`** — Called before creating a new token. Ensures only one valid token exists per user at any time. Prevents inbox flooding attacks.
- **`deleteExpired()`** — Cleanup function. Can be called periodically or on each forgot-password request. Removes tokens that expired more than 7 days ago (grace period for audit trail).
- **`findValidByHash()`** — Single query checks hash match, not-used, and not-expired in one atomic operation.

#### Tests

**File**: `server/tests/passwordResetToken.test.js`

These tests use the real test database (following existing factory patterns) to verify SQL correctness.

- `create()` inserts a token and returns it with correct `user_id`, `token_hash`, `expires_at`.
- `findValidByHash()` returns the token when hash matches, `used_at` is null, and `expires_at` is in the future.
- `findValidByHash()` returns `null` for a non-existent hash.
- `findValidByHash()` returns `null` for an expired token (set `expires_at` to past).
- `findValidByHash()` returns `null` for a used token (set `used_at` to a timestamp).
- `markUsed()` sets `used_at` to current timestamp.
- `markUsed()` causes subsequent `findValidByHash()` to return `null` for the same token.
- `invalidateForUser()` marks all unused tokens for a user as used.
- `invalidateForUser()` does not affect tokens belonging to other users.
- `deleteExpired()` removes tokens that expired more than 7 days ago.
- `deleteExpired()` does not remove tokens that expired less than 7 days ago.
- Deleting a user cascades to delete their tokens.

---

### 4.3 Forgot Password Flow

#### 4.3.1 Backend

**Modified file**: `server/src/services/auth.service.js` — Add `forgotPassword(email)` and `resetPassword(token, newPassword)` functions.

**Modified file**: `server/src/routes/auth.routes.js` — Add two new endpoints.

##### `POST /api/auth/forgot-password`

**Request body**: `{ "email": "user@example.com" }`

**Behavior**:
1. Validate that `email` field is present. If missing, return 400.
2. Look up user by email via `userModel.findByEmail(email)`.
3. **If user not found OR user is a bot**: Return 200 with `{ message: "If that email is registered, you will receive a reset link" }`. Do NOT reveal whether the email exists.
4. Invalidate all existing tokens for this user via `invalidateForUser(userId)`.
5. Generate a 32-byte random token using `crypto.randomBytes(32).toString('hex')`.
6. Hash the token with SHA-256: `crypto.createHash('sha256').update(token).digest('hex')`.
7. Store the hash in `password_reset_tokens` with `expires_at = NOW() + 1 hour`.
8. Build reset URL: `${APP_URL}/reset-password?token=${token}`.
9. Send email via `emailService.sendPasswordReset(email, username, resetUrl)`.
10. Return 200 with `{ message: "If that email is registered, you will receive a reset link" }`.
11. Clean up expired tokens via `deleteExpired()` (opportunistic, non-blocking).

**Rate limiting**: Uses the existing `authLimiter` (15 req/15 min).

##### `POST /api/auth/reset-password`

**Request body**: `{ "token": "abc123...", "newPassword": "newSecurePassword" }`

**Behavior**:
1. Validate that `token` and `newPassword` fields are present. If missing, return 400.
2. Validate `newPassword.length >= 8`. If too short, return 400.
3. Hash the provided token with SHA-256.
4. Look up the token via `findValidByHash(hashedToken)`.
5. **If not found** (invalid, expired, or already used): Return 400 with `{ error: "Invalid or expired reset token" }`.
6. Mark the token as used via `markUsed(tokenId)`.
7. Hash the new password with bcrypt (10 salt rounds).
8. Update the user's password via `userModel.updatePasswordHash(userId, passwordHash)`.
9. Clear `must_reset_password` flag via `userModel.setMustResetPassword(userId, false)`.
10. Return 200 with `{ message: "Password has been reset successfully" }`.

**No authentication required** — this endpoint is public (the token IS the authentication).

**Rate limiting**: Uses the existing `authLimiter` (15 req/15 min).

#### Acceptance Criteria

- AC-FP-1: `POST /forgot-password` with a valid, registered email creates a token in the database and sends an email with a reset link.
- AC-FP-2: `POST /forgot-password` with an unknown email returns 200 with the same success message (no email enumeration).
- AC-FP-3: `POST /forgot-password` with a bot user's email returns 200 with no email sent.
- AC-FP-4: `POST /forgot-password` invalidates all prior tokens for that user before creating a new one.
- AC-FP-5: Reset tokens expire after 1 hour.
- AC-FP-6: `POST /reset-password` with a valid, unexpired, unused token changes the user's password.
- AC-FP-7: `POST /reset-password` with an expired token returns 400.
- AC-FP-8: `POST /reset-password` with an already-used token returns 400.
- AC-FP-9: `POST /reset-password` with a random/invalid token returns 400.
- AC-FP-10: `POST /reset-password` enforces 8-character minimum on new password.
- AC-FP-11: After a successful reset, the user can log in with the new password.
- AC-FP-12: After a successful reset, the old password no longer works.
- AC-FP-13: After a successful reset, `must_reset_password` is set to `false`.
- AC-FP-14: The reset token is stored as a SHA-256 hash, not plaintext.
- AC-FP-15: The same success message is returned regardless of whether the email exists (timing-safe).

#### Tests

**File**: `server/tests/forgotPassword.test.js`

Integration tests using supertest against real endpoints with the test database.

**Setup**: Each test uses `createTestUser()` from factories to create a user.

##### Forgot Password Endpoint Tests
- `POST /api/auth/forgot-password` with valid email → 200, message contains "If that email is registered".
- `POST /api/auth/forgot-password` with valid email → token row exists in `password_reset_tokens` table.
- `POST /api/auth/forgot-password` with valid email → token_hash in DB is a 64-char hex string (SHA-256), not the raw token.
- `POST /api/auth/forgot-password` with unknown email → 200, same success message (no leak).
- `POST /api/auth/forgot-password` with unknown email → no token row created in DB.
- `POST /api/auth/forgot-password` with bot user email → 200, no token row created.
- `POST /api/auth/forgot-password` with missing email field → 400.
- `POST /api/auth/forgot-password` called twice for same user → only one valid (unused) token exists (prior invalidated).
- `POST /api/auth/forgot-password` → email service is called with correct recipient and a URL containing a token.

##### Reset Password Endpoint Tests
- `POST /api/auth/reset-password` with valid token + valid password → 200, "Password has been reset successfully".
- `POST /api/auth/reset-password` → user can login with new password after reset.
- `POST /api/auth/reset-password` → user cannot login with old password after reset.
- `POST /api/auth/reset-password` → token's `used_at` is set after successful reset.
- `POST /api/auth/reset-password` with same token used again → 400 "Invalid or expired reset token".
- `POST /api/auth/reset-password` with expired token (manually set `expires_at` to past) → 400.
- `POST /api/auth/reset-password` with garbage token → 400.
- `POST /api/auth/reset-password` with empty string token → 400.
- `POST /api/auth/reset-password` with missing token field → 400.
- `POST /api/auth/reset-password` with missing newPassword field → 400.
- `POST /api/auth/reset-password` with newPassword < 8 chars → 400.
- `POST /api/auth/reset-password` clears `must_reset_password` flag for the user.

##### Email Service Mock Pattern

For integration tests that need to verify email was sent without actually sending:

```javascript
// In test setup, mock the email service
jest.mock('../src/services/email.service', () => ({
  sendPasswordReset: jest.fn().mockResolvedValue({ sent: true }),
  sendAdminResetNotification: jest.fn().mockResolvedValue({ sent: true }),
  sendWelcome: jest.fn().mockResolvedValue({ sent: true }),
}));
const emailService = require('../src/services/email.service');

// In test assertions
expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
  'user@example.com',
  'username',
  expect.stringContaining('/reset-password?token=')
);
```

#### 4.3.2 Frontend

##### Forgot Password Page

**File**: `client/src/pages/ForgotPassword.jsx`

A standalone public page (no auth required) accessible at `/forgot-password`.

**UI Elements**:
- DeepRun logo + heading "Forgot Password"
- Email input field with label
- Submit button ("Send Reset Link")
- Link back to login page
- Success state: "If that email is registered, you'll receive a reset link shortly."
- Error state: Alert banner for network/server errors

**Behavior**:
1. On submit, call `POST /api/auth/forgot-password` with `{ email }`.
2. On 200, show success message regardless of response. Disable re-submit for 60 seconds (prevent spam clicks).
3. On network error, show "Something went wrong. Please try again."

##### Reset Password Page

**File**: `client/src/pages/ResetPassword.jsx`

A standalone public page (no auth required) accessible at `/reset-password?token=...`.

**UI Elements**:
- DeepRun logo + heading "Set New Password"
- New password input
- Confirm password input
- Submit button ("Reset Password")
- Success state: "Password reset! Redirecting to login..." (auto-redirect after 3 seconds)
- Error state: Alert banner for invalid/expired token or server errors

**Behavior**:
1. On mount, extract `token` from URL query params (`useSearchParams`).
2. If no token in URL, show error "Invalid reset link".
3. On submit, validate passwords match and >= 8 chars.
4. Call `POST /api/auth/reset-password` with `{ token, newPassword }`.
5. On 200, show success and redirect to `/login` after 3 seconds.
6. On 400, show the error message from the server (e.g., "Invalid or expired reset token").

##### Route Registration

**File**: `client/src/App.jsx`

Add two new public routes alongside `/login`, `/register`, and `/change-password`:

```jsx
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
```

##### Login Page Update

**File**: `client/src/pages/Login.jsx`

Replace the existing "Forgot your password? Email Ian..." text with a link to the forgot password page:

```jsx
<Link to="/forgot-password" className="text-primary hover:underline">
  Forgot your password?
</Link>
```

##### Frontend Tests

**File**: `client/src/pages/ForgotPassword.test.jsx`

- Renders email input and submit button.
- Submit with empty email shows validation error.
- Submit with valid email calls API and shows success message.
- API error shows error alert.
- Success state disables submit button.
- Link to login page exists and points to `/login`.

**File**: `client/src/pages/ResetPassword.test.jsx`

- Renders password fields when token is present in URL.
- Shows error when no token in URL query params.
- Submit with mismatched passwords shows validation error.
- Submit with password < 8 chars shows validation error.
- Successful reset shows success message.
- Successful reset navigates to `/login`.
- Expired/invalid token error from API displays error message.

**Test patterns**: Follow existing Login.test.jsx patterns — mock `react-router-dom`, mock `api.post`, render with `MemoryRouter`, use `@testing-library/react` for queries and assertions.

---

### 4.4 Admin Reset Notification Email

**Modified file**: `server/src/routes/admin.routes.js`

After the existing password reset logic in `PATCH /api/admin/users/:id/reset-password`, add an email notification:

```javascript
// Existing code (unchanged):
const passwordHash = await bcrypt.hash(newPassword, 10);
const user = await userModel.updatePasswordHash(req.params.id, passwordHash);
await userModel.setMustResetPassword(req.params.id, true);

// New code — fire-and-forget email:
const fullUser = await userModel.findById(req.params.id);
if (fullUser && !fullUser.is_bot) {
  emailService.sendAdminResetNotification(fullUser.email, fullUser.username, newPassword);
  // Do not await — email failure must not block the admin response
}

res.json({ message: `Password reset for ${user.email}` });
```

#### Acceptance Criteria

- AC-AR-1: Admin password reset sends an email notification to the user with their temporary password.
- AC-AR-2: Admin password reset still succeeds (200) even if email sending fails.
- AC-AR-3: Admin password reset does not send email to bot users.
- AC-AR-4: The email contains the user's username and the temporary password.

#### Tests

**File**: `server/tests/adminResetEmail.test.js`

Uses the email service mock pattern described in section 4.3.

- `PATCH /api/admin/users/:id/reset-password` with valid data → calls `emailService.sendAdminResetNotification` with user's email, username, and the temporary password.
- `PATCH /api/admin/users/:id/reset-password` → returns 200 even when `sendAdminResetNotification` throws.
- `PATCH /api/admin/users/:id/reset-password` for a bot user → does NOT call `sendAdminResetNotification`.

---

### 4.5 Welcome Email

**Modified file**: `server/src/services/auth.service.js`

In the `register()` function, after creating the user, send a welcome email:

```javascript
async function register(username, email, password) {
  // ... existing validation and user creation ...
  const user = await userModel.createUser(username, email, passwordHash);

  // Fire-and-forget welcome email
  emailService.sendWelcome(email, username).catch(() => {});

  return user;
}
```

#### Acceptance Criteria

- AC-WE-1: Successful registration sends a welcome email to the new user.
- AC-WE-2: Registration still succeeds (201) even if email sending fails.
- AC-WE-3: Failed registration (duplicate email, validation) does not send a welcome email.

#### Tests

**File**: `server/tests/welcomeEmail.test.js`

- `POST /api/auth/register` with valid data → calls `emailService.sendWelcome` with the user's email and username.
- `POST /api/auth/register` → returns 201 even when `sendWelcome` throws.
- `POST /api/auth/register` with duplicate email (409) → does NOT call `sendWelcome`.

---

## 5. Email Templates

All templates follow the same structure: simple, single-column HTML with inline CSS. No external images, no tracking pixels. Plain text fallback is not required for V1 (transactional emails from known senders render fine in all modern clients).

### 5.1 Password Reset Email

**Subject**: "Reset your DeepRun password"

**Body elements**:
- "Hi {username}," greeting
- "We received a request to reset your password."
- CTA button: "Reset Password" linking to `{resetUrl}`
- "This link expires in 1 hour."
- "If you didn't request this, you can safely ignore this email."
- Plain URL fallback below the button (some email clients block buttons)

### 5.2 Admin Reset Notification

**Subject**: "Your DeepRun password has been reset"

**Body elements**:
- "Hi {username}," greeting
- "An admin has reset your password."
- "Your temporary password is: **{temporaryPassword}**"
- "You will be required to change your password when you next log in."
- Link to login page: `{APP_URL}/login`

### 5.3 Welcome Email

**Subject**: "Welcome to DeepRun!"

**Body elements**:
- "Hi {username}," greeting
- "Your account is ready."
- Brief description of DeepRun (1-2 sentences)
- CTA button: "Go to Dashboard" linking to `{APP_URL}/dashboard`

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Email enumeration** | `POST /forgot-password` always returns the same 200 response and message, whether the email exists or not. |
| **Token guessability** | Tokens are 32 bytes (256 bits) of `crypto.randomBytes()` — computationally infeasible to guess. |
| **Database compromise** | Tokens are stored as SHA-256 hashes. Raw tokens only exist in the email and in memory during verification. |
| **Replay attacks** | Tokens are single-use (`used_at` is set on consumption). |
| **Token expiry** | 1-hour TTL. Expired tokens are rejected by `findValidByHash()`. |
| **Multiple token requests** | Prior tokens are invalidated when a new one is requested (`invalidateForUser()`). |
| **Timing attacks** | The forgot-password endpoint does the same work (hash, DB write) regardless of whether the email exists, keeping response times consistent. For unknown emails, skip the DB write but still hash (constant-time path). |
| **Brute force** | Rate limited to 15 requests per 15 minutes per IP (existing `authLimiter`). |
| **XSS in emails** | All user-supplied values (username) are HTML-escaped before insertion into email templates. |
| **Race conditions** | `markUsed()` uses `UPDATE ... WHERE id = $1 AND used_at IS NULL RETURNING *` — returns null if already consumed by a concurrent request. |
| **SMTP credential leakage** | Credentials are in env vars only, never logged. SMTP failures log the error message but not the credentials. |

---

## 7. Test Factories

### New Factory Functions

**File**: `server/tests/factories.js`

Add a helper for directly creating password reset tokens in tests:

```javascript
async function createTestPasswordResetToken(userId, overrides = {}) {
  const crypto = require('crypto');
  const rawToken = overrides.rawToken || crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const defaults = {
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
    used_at: null,
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, tokenHash, data.expires_at, data.used_at]
  );
  return { token: result.rows[0], rawToken };
}
```

Add to `truncateTables()` in `server/tests/setup.js`:

```javascript
// Add to the TRUNCATE list:
password_reset_tokens
```

---

## 8. File Summary

### New Files

| File | Type | Description |
|------|------|-------------|
| `database/migrations/014_add_password_reset_tokens.sql` | Migration | Creates `password_reset_tokens` table with indexes |
| `server/src/services/email.service.js` | Service | Nodemailer transport + template functions |
| `server/src/models/passwordResetToken.model.js` | Model | CRUD for password reset tokens |
| `client/src/pages/ForgotPassword.jsx` | Page | Email input form for requesting reset |
| `client/src/pages/ResetPassword.jsx` | Page | New password form using token from URL |
| `server/tests/email.test.js` | Test | Email service unit tests (mocked transport) |
| `server/tests/passwordResetToken.test.js` | Test | Token model integration tests |
| `server/tests/forgotPassword.test.js` | Test | Forgot/reset password endpoint integration tests |
| `server/tests/adminResetEmail.test.js` | Test | Admin reset notification tests |
| `server/tests/welcomeEmail.test.js` | Test | Welcome email tests |
| `client/src/pages/ForgotPassword.test.jsx` | Test | Forgot password page component tests |
| `client/src/pages/ResetPassword.test.jsx` | Test | Reset password page component tests |

### Modified Files

| File | Change |
|------|--------|
| `server/package.json` | Add `resend` and `nodemailer` dependencies |
| `server/.env.example` | Add SMTP + APP_URL variables |
| `server/src/services/auth.service.js` | Add `forgotPassword()`, `resetPassword()`, welcome email call in `register()` |
| `server/src/routes/auth.routes.js` | Add `POST /forgot-password` and `POST /reset-password` routes |
| `server/src/routes/admin.routes.js` | Add email notification to existing password reset endpoint |
| `client/src/App.jsx` | Add `/forgot-password` and `/reset-password` routes |
| `client/src/pages/Login.jsx` | Replace email-for-help text with "Forgot password?" link |
| `server/tests/factories.js` | Add `createTestPasswordResetToken()` factory |
| `server/tests/setup.js` | Add `password_reset_tokens` to truncation list |

---

## 9. Implementation Order (TDD)

Follow this order to build each piece test-first. Each phase is independently shippable.

### Phase 1: Migration + Model (Test-First)

1. Write `server/tests/passwordResetToken.test.js` with all model tests (they will fail — table doesn't exist yet).
2. Create `database/migrations/014_add_password_reset_tokens.sql`.
3. Create `server/src/models/passwordResetToken.model.js`.
4. Run tests — all model tests pass.
5. Update `server/tests/factories.js` with `createTestPasswordResetToken()`.
6. Update `server/tests/setup.js` with `password_reset_tokens` in truncation.

### Phase 2: Email Service (Test-First)

1. Install dependencies: `cd server && npm install resend nodemailer`.
2. Write `server/tests/email.test.js` with all email service tests (mock both Resend SDK and Nodemailer).
3. Create `server/src/services/email.service.js` with dual-transport support.
4. Run tests — all email tests pass.
5. Update `server/.env.example` with `RESEND_API_KEY`, SMTP, `EMAIL_FROM`, and `APP_URL` variables.

### Phase 3: Forgot/Reset Password Backend (Test-First)

1. Write `server/tests/forgotPassword.test.js` with all endpoint tests (mock email service).
2. Add `forgotPassword()` and `resetPassword()` to `server/src/services/auth.service.js`.
3. Add `POST /forgot-password` and `POST /reset-password` to `server/src/routes/auth.routes.js`.
4. Run tests — all forgot/reset tests pass.

### Phase 4: Admin Reset Notification (Test-First)

1. Write `server/tests/adminResetEmail.test.js`.
2. Modify `server/src/routes/admin.routes.js` to send notification email.
3. Run tests — all admin email tests pass.

### Phase 5: Welcome Email (Test-First)

1. Write `server/tests/welcomeEmail.test.js`.
2. Modify `server/src/services/auth.service.js` register function.
3. Run tests — all welcome email tests pass.

### Phase 6: Frontend (Test-First)

1. Write `client/src/pages/ForgotPassword.test.jsx`.
2. Create `client/src/pages/ForgotPassword.jsx`.
3. Run tests — ForgotPassword tests pass.
4. Write `client/src/pages/ResetPassword.test.jsx`.
5. Create `client/src/pages/ResetPassword.jsx`.
6. Run tests — ResetPassword tests pass.
7. Update `client/src/App.jsx` with new routes.
8. Update `client/src/pages/Login.jsx` with forgot password link.

---

## 10. CLAUDE.md Updates

After implementation, add these entries to `CLAUDE.md`:

### API Routes section
```
- `/api/auth/forgot-password` — request password reset email (rate-limited)
- `/api/auth/reset-password` — consume reset token and set new password (rate-limited)
```

### Environment Variables section
```
- `RESEND_API_KEY` — Resend API key (recommended for Railway, uses HTTPS API)
- `SMTP_HOST` — SMTP server hostname (fallback, requires Railway Pro for SMTP ports)
- `SMTP_PORT` — SMTP port (default 587)
- `SMTP_USER` — SMTP username
- `SMTP_PASS` — SMTP password
- `EMAIL_FROM` — Sender email address
- `APP_URL` — Base URL for email links (default http://localhost:5173)
```

### Architecture > Backend section
```
- `services/email.service.js` — Dual-transport email (Resend API or Nodemailer SMTP) with graceful degradation, email templates
- `models/passwordResetToken.model.js` — Password reset token CRUD (SHA-256 hashed tokens)
```

### Migrations section
```
Numbered SQL files in `database/migrations/` (001 through 014). ... 014: password reset tokens.
```
