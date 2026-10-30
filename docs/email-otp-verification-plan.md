# Mandatory email OTP verification for new RUWĀD accounts (PLAN ONLY, nothing is built)

Status: audit and plan for owner approval. No code, no migration, no deployment, no production change. Advisory booking restrictions, `ADVISORY_BOOKINGS_ENABLED`, Daily.co and the calendar work are untouched. Daily PDPL review stays DEFERRED and NOT APPROVED.

## 1. Audit

### 1.1 How accounts and sessions work today

| Area | Finding |
| --- | --- |
| Signup | `POST /auth/register` (5 per minute per IP) creates the user and **immediately sets the login cookie** (`ruwad_token`, httpOnly, 7 days). The frontend then shows "Welcome to RUWĀD" and goes to the dashboard. A duplicate email answers 409 "An account with this email already exists" (this already reveals which emails are registered). |
| Login | `POST /auth/login` (10 per minute per IP): bcrypt compare, then status must be ACTIVE; wrong password and unknown email share one message. |
| Session | The JWT carries `sub`, `email`, `role`. `JwtStrategy.validate` runs on every guarded request and already checks that the account exists and is ACTIVE (so suspension ends a session at once). It is **the single choke point** for backend enforcement. An optional-JWT guard exists for personalised public reads and uses the same strategy. |
| Only two places mint a token | `register` and `login` in `auth.controller.ts`. |
| Roles | USER, FOUNDER, INVESTOR, ORGANIZATION_ADMIN, RUWAD_ADMIN, SUPER_ADMIN. Signup may pick the first four only. Admin accounts are made by hand in the database (there is no admin seeding code). |
| Status | `UserStatus` has only ACTIVE and SUSPENDED. |
| User table | **No verification column of any kind.** `/auth/me` returns every user column except the password hash, so a new `emailVerifiedAt` appears there automatically; secrets must therefore never be added to `users`. |
| Password reset | `forgot-password` always answers generically; the token table stores only a SHA-256 hash, one outstanding token, 30-minute expiry, 60-second per-account brake. A reset sets a new password and issues **no** session. Good pattern to mirror. |
| Email change | **Does not exist**: the profile update accepts no email field. |
| Google or other social sign-in | **None.** Google is used only to connect a calendar for an already signed-in user (and requires the Google email to equal the account email). |
| Invitations | **None** for accounts (team members are directory records, not logins). |
| Frontend gating | Client-side only (`useSession`, sign-in gates). There is **no Next.js middleware**, so backend enforcement is what protects data. Auth pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`; **no `/verify-email`**. |
| Throttling | In-memory per instance (fine for the single Lightsail instance, resets on restart), so OTP limits must also be stored in the database. |

### 1.2 Email layer (Resend)

`EmailService` wraps Resend: sender must be `EMAIL_FROM` (production `ruwadplatform@karama.tech`); a missing key or sender logs a warning and **skips silently**; it never throws and resolves true only when the provider accepted the message. It logs the **subject and recipient, never the body**, so a code placed only in the body is never logged (the subject must never contain it). Templates share one `layout()` with an HTML-escape helper; `passwordResetTemplate` is the model. Delivery to Saudi and corporate mailboxes and the sender domain are owner statements, **not verified by me, and live email has never been exercised in production**.

### 1.3 Who could be affected

- **Existing users:** my last verified production read (2026-10-29) showed **exactly one user: the administrator**. A fresh count was blocked by the safety classifier this time and I did not work around it; it will be re-confirmed (with approval) before any rollout.
- **Google OAuth accounts, invited users:** none exist. **Admin accounts:** made by hand; must be grandfathered.
- **Sessions in flight:** existing 7-day tokens must keep working, which the backfill below guarantees.
- **Advisory Services:** applicants are signed-in users, so verification also guarantees the address that receives application and decision emails is real. Booking stays disabled.

## 2. Design

### 2.1 Flow

1. **Signup:** validate, create the user **unverified** (`emailVerifiedAt` null), create a 6-digit code, send it, set **no login cookie**, answer a generic "check your email" (HTTP 202) and send the browser to `/verify-email`. A short-lived signed **pending-verification cookie** (httpOnly, 30 minutes, useless as a login token) remembers which account this browser is verifying.
2. **Verify:** the user types or pastes the 6 digits. Success sets `emailVerifiedAt`, burns the code, and (only if the pending cookie from this same browser matches) signs the user in and goes to the dashboard. From another device the user is told to sign in.
3. **Login before verification:** correct password but unverified returns 403 `EMAIL_NOT_VERIFIED` (the password proves ownership, so nothing leaks), issues the pending cookie, sends a fresh code if the cooldown allows, and the app routes to `/verify-email`. Wrong password stays the generic message.
4. **Resend:** 60-second cooldown, at most 10 codes per account per 24 hours and a per-IP daily cap; a new code supersedes (invalidates) the previous one.

### 2.2 The code

`crypto.randomInt(0, 1_000_000)` left-padded to 6 digits (uniform, cryptographically secure). Stored as **HMAC-SHA-256** of `userId | codeId | code` under a server key (plain SHA-256 of a 6-digit code could be reversed instantly if the table leaked), compared in constant time. Expiry 10 minutes. **5 wrong attempts burn the code.** Worst case an attacker gets 5 guesses per code and 10 codes a day, about 50 guesses in 1,000,000 per day per account, behind IP throttles. Used, superseded or expired codes are all rejected with the same message: "That code isn't valid or has expired. Request a new one."

### 2.3 Backend enforcement (not just routing)

`JwtStrategy.validate` additionally requires `emailVerifiedAt` when verification is switched on, so a valid token for an unverified account is refused (401) on every guarded route, whatever the frontend does. `login` also refuses. No other code path mints tokens. Password reset on an unverified account may change the password but neither verifies the email nor creates a session. A future email-change feature must reset verification.

### 2.4 Abuse and enumeration

- Signup, resend and verify answer the same way whether or not the address is registered. **Decision D1:** replace today's 409 with a generic response; an already-verified owner of the address gets an email saying so (with sign-in and reset links), an unverified one gets a fresh code.
- Constant-time work on unknown emails; the same response shape; per-account and per-IP limits stored in the database, plus the existing throttler for short windows.
- **Pre-hijacking:** signing up again for an address whose account is still unverified **overwrites** that account's password and profile and restarts verification, so an attacker who registered a victim's address cannot keep a known password.
- OTPs are never logged, never returned by any API, never in a URL; tests spy on every logger call and response body to prove it. (Resend itself keeps sent-email content for its own retention period; the short expiry limits the exposure.)

## 3. Database (one additive migration)

| Change | Detail |
| --- | --- |
| `users.emailVerifiedAt` | `timestamptz` null (metadata-only change in PostgreSQL, no table rewrite) |
| `users.emailVerifiedVia` | `varchar(16)` null: `OTP`, `LEGACY`, later `ADMIN` |
| New table `email_verification_codes` | id, userId, codeHash (64 hex), expiresAt, attempts, maxAttempts (5), consumedAt, supersededAt, ipHash (HMAC, for abuse caps only), deliveryResult, createdAt, updatedAt. Indexes on (userId, createdAt) and expiresAt. No foreign keys (repo convention) |
| Backfill, in the same migration | every existing user gets `emailVerifiedAt = now()` and `emailVerifiedVia = 'LEGACY'` so **no existing account, admin included, is locked out** |

Rollback: drop the table and the two columns. Production migrations here are manual and guarded: the existing guarded tool is Advisory-specific, so a small equivalent (plan, confirm phrase, before and after schema snapshot) is part of the work. There is no verified production backup (owner-accepted risk); the change is additive and the only existing-row write sets the two new columns.

## 4. Rollout (each step needs its own approval)

A switch `EMAIL_VERIFICATION_REQUIRED` (backend environment, off unless exactly `true`) controls enforcement; **off behaves exactly like today**, so it is both the safe default and the emergency stop.

1. Build and test locally (no production contact).
2. You approve. Apply the migration in production (columns, table, backfill), flag off.
3. Deploy the backend (flag off), then the frontend (it understands both old and new backend answers). Order matters: an old frontend talking to a verification-on backend would wrongly show "Welcome".
4. Pre-flight: one guarded test email from production to your mailbox to prove Resend delivery **before** enforcement.
5. Set `EMAIL_VERIFICATION_REQUIRED=true` (a new Lightsail deployment, your approval, AWS change) and run a live signup with an address you control.
6. Monitor signups, delivery failures and support contacts.
7. **Rollback:** set the flag off (about three minutes), or roll back the backend; the new columns and table are harmless. Recovery for a stuck user: Resend, "use a different email", the support address, and a guarded admin script that marks one email verified.

Dormant-until-flag also means Resend problems cannot block signup before you have seen a real email arrive.

## 5. Affected files

Backend: new migration `1794700000000-AddEmailVerification.ts`; `users/user.entity.ts`; new `auth/email-verification-code.entity.ts` and `auth/email-verification.service.ts`; `auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `jwt.strategy.ts`, `dto/` (verify, resend); `users/users.service.ts`; `email/email.service.ts` and `email-templates.ts` (code email, "you already have an account" email); a guarded `scripts/ops` migration and verify-user tools; `scripts/ops/launch-config.js` (flag rule); a dev-only email outbox (refused in production) so local tests can read the code without ever logging it; unit and integration tests; docs.
Frontend: new `app/verify-email/` (page, layout, noindex), `features/auth/VerifyEmailPage.tsx` and an OTP input component with paste and auto-advance; `features/auth/SignupPage.tsx` and `LoginPage.tsx`; `lib/api/auth.ts`, `lib/api/types.ts`, `lib/store.ts`; auth styles; unit tests.
Not touched: Advisory booking code and flags, Daily.co, calendar code, ML and everything unrelated.

## 6. Test plan

Unit: code generation (range, padding, uniformity), HMAC and constant-time compare, expiry, attempts, supersede, cooldown, daily caps, strategy enforcement, log and response scans for the code. Integration (local Postgres, supertest): register sets no cookie; login before verification 403 with the code; wrong code five times burns it; expired and reused codes; resend cooldown 429; success sets the cookie and `/auth/me` works; a forged-valid token for an unverified user gets 401 on protected routes; password reset on an unverified account does not verify; duplicate signup is generic; pre-hijack overwrite; existing and backfilled users unaffected; flag off equals old behaviour. Browser: signup to verify to dashboard, paste, wrong and expired codes, resend countdown, at phone (375 px), tablet and desktop widths, and the existing login, reset and account flows.

## 7. Risks

Resend delivery is unproven in production (the safeguard is the flag plus the pre-flight email). Users whose mail is slow or filtered need the resend and support paths. The generic signup response removes today's "email already registered" hint, which is the intended trade-off. In-memory throttles reset on restart (the database counters cover the important limits). Unverified accounts accumulate without cleanup (D4). The backfill trusts everyone who exists at migration time. No Privacy Policy page exists yet, and the new IP-hash and code records should be covered by it.

## 8. Decisions for the owner

D1 generic signup response (no email-exists hint), proposed yes. D2 grandfather every existing account at migration, proposed yes (one user today). D3 same-browser auto-login after the code, proposed yes; other devices sign in. D4 delete unverified accounts and old codes after 7 days, proposed yes. D5 derive the code-hashing key from the existing `JWT_SECRET` with a domain label (no new production secret) or add a dedicated `EMAIL_OTP_SECRET`, proposed derived. D6 a guarded admin "mark verified" script, proposed yes. D7 the dev-only email outbox for local tests, proposed yes. D8 the enforcement switch and a Lightsail environment change at step 5, proposed yes.
