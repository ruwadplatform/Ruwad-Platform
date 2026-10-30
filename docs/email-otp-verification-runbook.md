# Email OTP verification: implementation summary and production runbook

Status: implemented and tested LOCALLY ONLY on branch `feature/email-otp-verification`. Nothing is committed, pushed, migrated or deployed, and no AWS or Vercel setting was changed. Advisory booking restrictions (`ADVISORY_BOOKINGS_ENABLED`), Daily.co and the calendar work are untouched; the Daily PDPL review stays DEFERRED and NOT APPROVED. Email verification is separate from Advisory application approval (a verified address does not approve any application, and an approval does not verify an address).

## 1. How it behaves

- **Off by default.** `EMAIL_VERIFICATION_REQUIRED` is off unless exactly `true`. Off means the application behaves exactly as before (sign-up signs the user in at once). It is both the safe default and the emergency stop.
- **On:** sign-up creates the account unverified, emails a 6-digit code and signs nobody in; the browser goes to `/verify-email`. The code expires after 10 minutes, five wrong guesses burn it, a new code replaces the old one (60-second cooldown, ten delivered codes per account per day, thirty code rows per account and thirty per network address per day). Success marks the address verified (`emailVerifiedVia = OTP`) and signs the user in only in the same browser; elsewhere they are told to sign in.
- **Backend enforcement:** with the flag on, `JwtStrategy` also requires a verified address on every guarded request, so a valid-looking token for an unverified account gets 401 whatever the frontend does. Login with the right password on an unverified account returns 403 `EMAIL_NOT_VERIFIED` and routes to `/verify-email`.
- **No enumeration:** sign-up, resend and verify answer the same way for every address; an address that already has a verified account gets a "you already have an account" email instead of a code; a still-unverified account is overwritten by a fresh sign-up (pre-hijack protection).
- **Secrets:** the code exists in plain text only in memory and in the email. Only an HMAC-SHA-256 under `EMAIL_OTP_SECRET` is stored. It is never logged, never in a subject, never in an API response. Tests scan every log line, response, cookie and database row for it.

## 2. Environment variables

| Variable | Where | Value | Notes |
| --- | --- | --- | --- |
| `EMAIL_VERIFICATION_REQUIRED` | backend (Lightsail) | `true` to enforce; absent otherwise | the on/off switch |
| `EMAIL_OTP_SECRET` | backend (Lightsail) | base64 of at least 32 random bytes, for example `openssl rand -base64 32` | **required only while the switch is on**, validated at start-up: a missing, short or non-random value stops the service from starting (the previous deployment keeps serving). Never derived from `JWT_SECRET`. Never commit or print it |
| `EMAIL_DEV_OUTBOX_FILE` | **local development only** | absolute path ending `.jsonl` | **must never exist in production.** The email service refuses to start if it is set with `NODE_ENV=production`, with a Resend key, with a relative path or a path not ending `.jsonl`; `lightsail-env-audit.js` also flags it |
| Existing, unchanged | backend | `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `JWT_SECRET`, `NODE_ENV=production` | `APP_URL` is used for the sign-in link in the "already have an account" email |

No Vercel variable is needed.

## 3. Database migration `1794700000000-AddEmailVerification`

- Adds `users.emailVerifiedAt` and `users.emailVerifiedVia` (nullable, metadata-only change), tables `email_verification_codes` (hashed codes, foreign key to users with cascade) and `email_verification_audit` (hand-verification record, no foreign key).
- **Backfill in the same migration:** every existing account is marked verified (`LEGACY`), administrators included, so nobody existing can be locked out.
- Reversible (down drops the table, audit table and both columns); revert and re-apply were both exercised locally with all 11 local users intact.
- **Order matters:** the new backend code reads the new `users` columns, so the migration **must be applied before the new backend is deployed**. The old backend ignores the new columns, so applying it early is safe.
- Applied only with the guarded tool, which is the only production path (`RUN_MIGRATIONS=false` on the container):

```
plan   DATABASE_URL=<direct connection string> node backend/scripts/ops/email-verification-migrate.js plan
apply  DATABASE_URL=... EMAIL_VERIFICATION_MIGRATION_CONFIRM="APPLY-EMAIL-VERIFICATION-MIGRATION-TO <host>" NO_BACKUP_ACKNOWLEDGED=OWNER-ACCEPTED-RISK \
       node backend/scripts/ops/email-verification-migrate.js apply
```

`plan` is read-only and **prints the user count by role and status and the active administrators (masked)**, and refuses if any other migration is pending or part of the feature already exists. `apply` verifies afterwards: recorded, tables present, zero unverified accounts, zero unverified administrators, account count unchanged. (Pass a backup reference instead of the acknowledgement if one exists.)

## 4. Production rollout checklist (each step needs your separate approval)

1. **Before anything:** `aws login --profile ruwad`; confirm the Resend sender and domain by sending one test email from the Resend dashboard to your own mailbox (the owner statement that `karama.tech` is verified has never been exercised by this code).
2. **Confirm the user count and protect administrators:** run the migration tool in `plan` mode against production and read the account count and masked administrators.
3. **Apply the migration** (section 3). Verify: zero unverified accounts, zero unverified administrators.
4. **Deploy the backend** (push; GitHub Actions replaces the Lightsail container) with the switch still off. Verify health, that the administrator can still sign in and use protected routes, and that `GET /api/auth/pending-verification` answers `{"pending":false,...}`.
5. **Deploy the frontend** (Vercel). With the switch off nothing visible changes. Verify the existing pages and login.
6. **Enable:** set `EMAIL_OTP_SECRET` (a freshly generated strong value) and `EMAIL_VERIFICATION_REQUIRED=true` together in one Lightsail environment change (a new deployment). Check with `lightsail-env-audit.js` (it flags a weak or missing secret and a stray outbox variable). If the service fails to start the previous deployment keeps serving.
7. **Live smoke test** with an address you control: sign up, receive the email within a minute, verify, land on the dashboard; also sign in again, resend, and try a wrong code. If no email arrives within five minutes, set the switch off (rollback below).
8. **Monitor** sign-ups, delivery failures and support contacts for the first days.

## 5. Rollback and recovery

- **Switch off:** remove `EMAIL_VERIFICATION_REQUIRED` (or set it to `false`) in a new Lightsail deployment: behaviour returns to exactly the previous behaviour within minutes. Accounts that signed up while it was on and never verified can then sign in (nothing is enforced), and their pending codes simply expire.
- **Backend rollback:** possible at any time after the migration because the old code ignores the new columns. Do not roll the backend back past the Advisory booking gate (older images have no gate).
- **Migration rollback:** `migration:revert` (guarded production tool for it not built; use only with approval): drops the new tables and columns.
- **A person whose email never arrives:** resend (60-second cooldown), "use a different email" (a new sign-up overwrites the unverified account), the support address on the page, and as a last resort the guarded tool:

```
DATABASE_URL=... VERIFY_USER_CONFIRM="VERIFY-EMAIL <address> ON <host>" \
  node backend/scripts/ops/verify-user-email.js apply <address> --reason "<why>" --operator "<your name>"
```

  It is a command-line tool only (never an endpoint), needs the exact phrase, a reason and an operator name, touches one ACTIVE unverified account, and writes an audit record in the same transaction.
- **Unverified accounts are not deleted automatically** (see `docs/email-otp-unverified-cleanup-design.md`); expired code rows are deleted automatically after seven days.

## 6. Local use

`npm run start:local -- --email-verification` (backend) runs with verification on, a throwaway secret and a local email outbox file in the temp folder, so the code can be read during a walkthrough. `npm run test:auth` runs the integration suite against the local database only with a fake email service.

## 7. Risks to keep in view

Resend delivery is unproven in production (step 1 and the smoke test are the safeguards). In-memory throttling resets on restart (the database limits do not). Someone who is talked into reading out a code, or who registers another person's address and later gets the code from them, can verify an address they do not own; the email says never to share it. The first public sign-ups after enabling are the first real traffic through this path.
