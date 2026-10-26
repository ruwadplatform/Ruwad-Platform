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
| Advisor applications ("Become an Advisor") | Done: form, private documents, admin review, history, emails; see section 7 |
| Email | **Mock only** (`ADVISORY_EMAIL_MODE`), never for demonstration bookings |

## 2. Database

Three migrations, all in `backend/src/database/migrations-advisory/` and all **opt-in**:

1. `1794300000000-CreateAdvisoryServices`: new tables and enums; `CREATE EXTENSION IF NOT EXISTS btree_gist`; the exclusion constraint that makes double-booking impossible.
2. `1794400000000-AdvisoryAutomationAndMeetings`: the `EXPIRED` enum value, expiry / reminder / review / meeting columns on `advisory_bookings`, and the `advisory_meeting_attendance` and `advisory_webhook_events` tables.

3. `1794500000000-AdvisorApplications`: nullable application columns on `advisory_advisors` (contact email, phone, services, preferred duration, links, application reference, submitted and declaration times), plus the `advisory_application_documents` and `advisory_application_events` tables.

They only add; none touches an existing table outside the advisory ones. All were applied, reverted and re-applied on the local database. They have never been run anywhere else.

**Why opt-in:** Render still auto-deploys from `master` and runs pending migrations on start, and the AWS image runs them unless `RUN_MIGRATIONS=false`. Without the gate, merging this work would have applied it to Supabase as a side effect of an ordinary deploy. The CLI data source now lists the advisory folder only when `ADVISORY_MIGRATIONS=true` (`src/database/migration-sources.ts`). A normal deploy does not see these migrations.

To apply them, in the approved window and not before:

```
ADVISORY_MIGRATIONS=true <the usual migration command, pointed at production>
```

Notes:
- `btree_gist` needs separate approval. It is a Supabase-supported extension.
- The migrations are meant to be applied **together, in one window**. Revert newest first (`1794500000000`, then `1794400000000`, then `1794300000000`).
- Revert is supported (`down()` drops the new tables, indexes and columns). The `EXPIRED` enum value stays, because PostgreSQL cannot drop a single enum value; an unused value is harmless.
- Take or confirm a Supabase backup / point-in-time recovery point first.

## 3. Environment variables

Backend (set with `infra/aws/set-lightsail-env.js`; values are never printed):

| Variable | Default | Production intent |
|---|---|---|
| `ADVISORY_ENABLED` | off | `true` only after the migrations are applied |
| `ADVISORY_MIGRATIONS` | off | set only for the migration command, never on the running service |
| `ADVISORY_EMAIL_MODE` | `mock` | stays `mock` until live email is separately authorised (it also governs the application emails) |
| `ADVISORY_APPLICATIONS_EMAIL` | `ruwadplatform@gmail.com` | where "new advisor application" emails go; leave unset |
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

## 7. Advisor applications ("Become an Advisor")

An application **is** the advisor profile in `PENDING_REVIEW`, so there is one record to keep in step. It becomes public only when an administrator approves it.

- **Submit:** `POST /api/advisory/advisor/apply` is multipart: the form as JSON in `data`, plus `cv` (required, PDF, 5 MB), `certificates` (up to 5; PDF, PNG or JPG; 5 MB each) and `photo` (PNG or JPG, 2 MB). The server validates every field and each file's real contents (signature check, as in the Data Room). The profile, its documents and the history entry are written in one transaction. One application per account: a second, or two at the same instant, is a 409. Throttled to 10 per hour.
- **Documents** live in the database (`bytea`), are never selected by default, and are served only to administrators through `GET /api/advisory/admin/applications/:id/documents/:docId`, as an attachment with `Cache-Control: no-store` and `nosniff`. No public or applicant route returns the bytes. There is **no antivirus scan** (same as the Data Room).
- **Decisions** reuse `POST /api/advisory/admin/advisors/:id/approve|reject`. Each is one conditional `UPDATE` (only from an allowed state), so a double click or two administrators cannot both succeed: the loser gets a 409 and no second email. A rejection **requires a reason** (at least 10 characters), which is emailed to the applicant. `advisory_application_events` records who decided what, and when. It is the audit trail; the platform has no other audit log.
- **Emails** (mock unless `ADVISORY_EMAIL_MODE=live`): a new application goes to `ruwadplatform@gmail.com` (details, reference, a sign-in link to `/admin/advisory?application=<id>`, never a document), then the approval and the rejection (with the reason) go to the applicant's form address. A failed email is recorded and never undoes or hides the application or the decision. The history says plainly whether each email was sent, failed, or not sent (mock mode).
- **Applicant view:** the Advisor Dashboard shows the application's progress. A rejection reason is returned only on the applicant's own `GET /advisory/advisor/me`; an approval note stays internal.
- **Admin view:** Advisory Management → Applications (filters: Pending Review, Approved, Rejected, All) with the full application, its documents and history, and the two decisions.

Before going live, also settle:

- The browser sends the application through the site's own `/api` (the sign-in cookie belongs to the site). Confirm the Vercel proxy accepts a multipart body up to the largest allowed submission (about 12 MB with these limits). If it does not, lower the per-file limits. Verified locally only (a 4 MB CV through the local proxy).
- Applicants' documents are personal data: include them in the data-protection and retention review, and decide how long a rejected applicant's documents are kept.
- A rejected applicant cannot re-apply from the screen (the account already has a profile). An administrator can still approve a rejected application later.
- Live email needs the same authorisation and deliverability check as the booking emails.

## 8. Local tooling (never touches production)

All of these refuse any database that is not on this machine (`backend/scripts/dev/local-db-guard.js`):

```
npm run db:local               start the local Postgres (port 55432)
npm run migration:run:local    apply every migration, advisory ones included, to the local database
npm run advisory:seed:local    create the six fictional demonstration advisors
npm run start:local            start the built backend on the local database, mock email, throwaway JWT secret
npm run test:advisory          the integration suite (real Postgres, concurrency, permissions)
```
