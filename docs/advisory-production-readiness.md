# Advisory Services: production readiness

Status: **built and tested locally only.** Nothing here has been deployed, no production migration has been run, and no production setting has been changed. Everything below is a plan and a checklist for a separate, explicitly approved production window.

Branch: `feature/advisory-services`. Features are off by default in code (`ADVISORY_ENABLED`, `NEXT_PUBLIC_ADVISORY_ENABLED`), so merging the code does nothing visible until the flags and the migrations are in place.

## 1. What exists

| Area | State |
|---|---|
| Directory, profiles, calendar, booking | Done; server is the source of truth for slots and "Next available" |
| Bookings: request, approve/reject, cancel, mutual reschedule | Done (see `backend/src/advisory/booking-state.ts`) |
| Automation: request expiry (72 h, never later than 30 min before start), expiry warning (24 h), reminders (24 h and 1 h), reschedule-proposal expiry | Done; **scheduler off by default** |
| Video: Daily Prebuilt behind a provider interface; simulated rooms | Done; **real Daily never run live** (no account yet) |
| Attendance, Needs Review queue, recording the outcome | Done; Daily webhook payload shapes **unverified** |
| Automatic completion | Built but **off and not approved** |
| Email | **Mock only** (`ADVISORY_EMAIL_MODE`), never for demonstration bookings |

## 2. Database

Two migrations, both in `backend/src/database/migrations-advisory/` and both **opt-in**:

1. `1794300000000-CreateAdvisoryServices`: new tables and enums; `CREATE EXTENSION IF NOT EXISTS btree_gist`; the exclusion constraint that makes double-booking impossible.
2. `1794400000000-AdvisoryAutomationAndMeetings`: the `EXPIRED` enum value, expiry / reminder / review / meeting columns on `advisory_bookings`, and the `advisory_meeting_attendance` and `advisory_webhook_events` tables.

Both only add; neither touches an existing table. Both were applied, reverted and re-applied on the local database. They have never been run anywhere else.

**Why opt-in:** Render still auto-deploys from `master` and runs pending migrations on start, and the AWS image runs them unless `RUN_MIGRATIONS=false`. Without the gate, merging this work would have applied it to Supabase as a side effect of an ordinary deploy. The CLI data source now lists the advisory folder only when `ADVISORY_MIGRATIONS=true` (`src/database/migration-sources.ts`). A normal deploy does not see these migrations.

To apply them, in the approved window and not before:

```
ADVISORY_MIGRATIONS=true <the usual migration command, pointed at production>
```

Notes:
- `btree_gist` needs separate approval. It is a Supabase-supported extension.
- The migrations are meant to be applied **together, in one window**.
- Revert is supported (`down()` drops the new tables, indexes and columns). The `EXPIRED` enum value stays, because PostgreSQL cannot drop a single enum value; an unused value is harmless.
- Take or confirm a Supabase backup / point-in-time recovery point first.

## 3. Environment variables

Backend (set with `infra/aws/set-lightsail-env.js`; values are never printed):

| Variable | Default | Production intent |
|---|---|---|
| `ADVISORY_ENABLED` | off | `true` only after the migrations are applied |
| `ADVISORY_MIGRATIONS` | off | set only for the migration command, never on the running service |
| `ADVISORY_EMAIL_MODE` | `mock` | stays `mock` until live email is separately authorised |
| `ADVISORY_SCHEDULER_ENABLED` | off | `true` on **AWS only** (see section 5) |
| `ADVISORY_AUTOCOMPLETE_ENABLED` | off | **leave off**: not approved |
| `ADVISORY_REQUEST_EXPIRY_HOURS` / `_CUTOFF_MINUTES` / `_EXPIRY_WARNING_HOURS` | 72 / 30 / 24 | tunable |
| `ADVISORY_REVIEW_GRACE_MINUTES` / `ADVISORY_ATTENDANCE_MIN_MINUTES` | 30 / 5 | tunable |
| `ADVISORY_VIDEO_PROVIDER` | `mock` | `daily` only after a Daily account exists and is approved |
| `DAILY_API_KEY`, `DAILY_DOMAIN`, `DAILY_WEBHOOK_SECRET` | unset | secrets; only with the Daily account |
| `DAILY_API_BASE` | `https://api.daily.co/v1` | leave |
| `ADVISORY_MEETING_OPENS_MINUTES` / `_CLOSES_MINUTES` / `_MAX_PARTICIPANTS` / `_CLEANUP_MINUTES` | 10 / 15 / 4 / 60 | tunable |
| Existing: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `PUBLIC_API_URL` | already set | `APP_URL` must be the Vercel address |

Vercel: `NEXT_PUBLIC_ADVISORY_ENABLED=true` (build-time; needs a redeploy).

Daily's webhook URL (when it exists) is `https://<backend>/api/advisory/webhooks/daily`. It is public, so the signature is the only gate; it answers 404 unless `DAILY_WEBHOOK_SECRET` is set. `main.ts` now keeps the raw request body (`rawBody: true`), which signature checking needs; JSON parsing is unchanged.

## 4. Deployment sequence (every step needs separate approval)

1. Confirm a database backup / recovery point.
2. Enable `btree_gist` and apply both migrations (section 2). Verify the tables exist and the existing app is unaffected.
3. Deploy the backend with every advisory flag **off**. Check `/api/health`, existing pages, and that advisory routes answer 404.
4. Deploy the frontend with the flag **off**.
5. Turn on `ADVISORY_ENABLED` on the backend only; smoke-test the API with an administrator account.
6. Turn on `NEXT_PUBLIC_ADVISORY_ENABLED` and redeploy the frontend.
7. Onboard the first real advisor through the admin screen. **Demonstration advisors are not seeded in production**: the seed script is local-only by design.
8. Switch on, one at a time and watching each: the scheduler (AWS only), then real video, then live email.

There is no staging environment; step 5 is the closest thing to one.

**Rollback:** switch the flags off (a backend environment change is a new deployment; the frontend needs a redeploy or a Vercel instant rollback). Data is kept. The migrations can be reverted separately if ever needed.

## 5. Two backends

Render and AWS both exist. The scheduler claims every row with `UPDATE ... FOR UPDATE SKIP LOCKED` and stamps a column, so two runners cannot double-process or double-email (a test proves it, and fails if the clause is removed). Even so, enable `ADVISORY_SCHEDULER_ENABLED` on **one** backend (AWS) only.

## 6. Open items before real use

- **Daily has never been run live.** The provider is tested against a fake Daily server. Do one supervised check with two people before relying on it. Confirm the room property names (`enable_chat`, `enable_screenshare`, `enable_prejoin_ui`, `enable_knocking`).
- **Webhook payload shapes are assumed** from Daily's documentation (`room`, `session_id`, `user_id`, `joined_at`, `duration`, event `id` and `event_ts`). Confirm them against real events.
- Webhooks need a Daily account with a card on file; there is no spending cap, so set a usage alert in Daily.
- `@daily-co/daily-js` (0.87.0; 0.94.0 needs Node >= 22.14) depends on `@sentry/browser`, so it can report errors to a third party. Review this before live activation.
- **Saudi data-protection and data-residency requirements** for a US-based video provider need review before live activation. The HIPAA add-on was not bought; meetings are not recorded and carry a notice against sharing patient-identifiable information.
- Automatic completion stays off until separately approved.
- Live email needs authorisation and a deliverability check for the sending domain.
- An unrelated `zod` advisory remains in the dependency tree (not part of this work).

## 7. Local tooling (never touches production)

All of these refuse any database that is not on this machine (`backend/scripts/dev/local-db-guard.js`):

```
npm run db:local               start the local Postgres (port 55432)
npm run migration:run:local    apply every migration, advisory ones included, to the local database
npm run advisory:seed:local    create the six fictional demonstration advisors
npm run start:local            start the built backend on the local database, mock email, throwaway JWT secret
npm run test:advisory          the integration suite (real Postgres, concurrency, permissions)
```
