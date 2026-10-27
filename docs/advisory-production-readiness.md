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
7. Onboard the first real advisor through the admin screen. **No demonstration advisors are seeded anywhere**: advisors exist only once a real application is approved by an administrator.
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

- **Submit:** `POST /api/advisory/advisor/apply` is multipart: the form as JSON in `data`, plus `cv` (required, PDF, 2 MB), `certificates` (up to 5; PDF, PNG or JPG; 2 MB each) and `photo` (PNG or JPG, 1 MB); 8 MB in all. The server validates every field and each file's real contents (signature check, as in the Data Room). The profile, its documents and the history entry are written in one transaction. One application per account: a second, or two at the same instant, is a 409. Throttled to 10 per hour.
- **Documents** live in the database (`bytea`), are never selected by default, and are served only to administrators through `GET /api/advisory/admin/applications/:id/documents/:docId`, as an attachment with `Cache-Control: no-store` and `nosniff`. No public or applicant route returns the bytes. There is **no antivirus scan** (same as the Data Room).
- **Decisions** reuse `POST /api/advisory/admin/advisors/:id/approve|reject`. Each is one conditional `UPDATE` (only from an allowed state), so a double click or two administrators cannot both succeed: the loser gets a 409 and no second email. A rejection **requires a reason** (at least 10 characters), which is emailed to the applicant. `advisory_application_events` records who decided what, and when. It is the audit trail; the platform has no other audit log.
- **Emails** (mock unless `ADVISORY_EMAIL_MODE=live`): a new application goes to `ruwadplatform@gmail.com` (details, reference, a sign-in link to `/admin/advisory?application=<id>`, never a document), then the approval and the rejection (with the reason) go to the applicant's form address. A failed email is recorded and never undoes or hides the application or the decision. The history says plainly whether each email was sent, failed, or not sent (mock mode).
- **Applicant view:** the Advisor Dashboard shows the application's progress. A rejection reason is returned only on the applicant's own `GET /advisory/advisor/me`; an approval note stays internal.
- **Admin view:** Advisory Management → Applications (filters: Pending Review, Approved, Rejected, All) with the full application, its documents and history, and the two decisions.

### Edit & Reapply

- `POST /api/advisory/advisor/reapply` (same multipart shape). Only the owner of a **REJECTED** application may use it; anything else is a 404 (no application) or 409 (pending, approved, suspended). The CV on file is kept unless a new one is attached; a new CV or photograph replaces the old one; the applicant chooses which certificates to remove (ids are checked against their own application).
- The move back to `PENDING_REVIEW` is one conditional `UPDATE` (only while the row is REJECTED and belongs to the caller), so two clicks, two tabs or a retry produce exactly one resubmission and one email, and a pending application can never be duplicated.
- Nothing is lost: the earlier rejection and its reason stay in `advisory_application_events` and are shown to the applicant (privately) and to administrators; a `RESUBMITTED` event records the attempt number and which files were added or replaced. Replaced and removed files are **deleted**. The reference number stays the same.
- RUWĀD is told by an "Updated Advisor Application" email (mock by default; subject `Updated Advisor Application – RUWĀD Advisory Services`; includes the previous rejection reason; no documents). A failed email never undoes the resubmission.

### Upload size through the Vercel proxy (investigated 2026-10-26, nothing changed)

The browser reaches the API through a Next.js rewrite on Vercel to the backend host. Vercel's documented 4.5 MB limit is for Functions; its rewrite documentation gives no body limit. Anonymous probes of the real path (`POST /api/resume-parse`, a public route that reads the whole body and rejects it before any AI call; random bytes, declared as text) showed:

- 1, 3, 4.4 and 4.75 MiB bodies each got through once and were read by the backend (400 from the application). A 4.98 MB body therefore passed, so there is **no hard 4.5 MB cap on rewrites**.
- The same path also failed intermittently at 2 MiB and above (502 `ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR_CD8`, 503, 504), and **going straight to the backend host failed the same way** (24 s for a 3.5 MiB body, then 502 and 504). So the weak link is the backend host's front end handling slow multi-megabyte uploads (the host is in Sydney; the probes came from a home connection), not Vercel.
- Bodies of 600 KB or less never failed. Probes against routes that answer without reading the body (like the application route while its feature flag is off) are unreliable for this: the origin answers early and resets the connection, which shows up as the same 502.

Decision: the application limits were lowered to CV 2 MB, certificate 2 MB each, photograph 1 MB, 8 MB in all, the screen says so before sending, and a dropped connection shows "Nothing was saved. Please try again, or use smaller files." Before real use, test one authenticated upload of about 2 MB from Saudi Arabia against the real stack (needs the feature enabled; that is a deployment step), and look at the backend host's request timeout and any load-balancer body limits. If large files are still needed, the robust fix is a direct-to-storage upload (a signed URL), which this work did not introduce.

### Security review (this feature)

- **Upload authentication:** the route needs the JWT cookie. Guards run before the body is read, so an anonymous request is a 401 and its body is never parsed. The cookie belongs to the site, so the upload goes through `/api`, not directly to the backend host.
- **File validation:** extension and slot rules, size limits (multer stops oversized parts early, the service checks each file), PDF / PNG / JPEG signature check on the bytes, safe file names, per-slot counts and an overall total. Not done: antivirus scanning, and a deep PDF check (a PDF with active content would pass). That is acceptable only because documents are never rendered in the site's origin: they download as attachments with `nosniff` and `no-store`, to administrators only.
- **Document access:** admin-only route, scoped by both application id and document id; no public, applicant or booking route returns the bytes; the applicant sees file names and sizes only.
- **Duplicates:** one profile per account (unique index); resubmission and each decision are single conditional updates; the screen sends each form once.
- **Reapplication authorization:** owner only, REJECTED only, ids checked against the owner's own documents; an unknown field (for example `status`) is refused.
- **Personal data and retention (needs a decision before launch):** an application holds name, email, phone, employer, a CV and possibly certificates and a photograph. Nothing deletes them automatically. Replaced or removed files are deleted at reapplication. Decide and document: how long a rejected applicant's data and documents are kept (suggestion: delete the documents, keep the decision record, some months after the final rejection unless the applicant asks sooner), how an applicant can ask for deletion, and who may access the documents (today: any RUWAD_ADMIN or SUPER_ADMIN). Saudi data-protection requirements for storing these in the hosted database should be reviewed together with the video-provider review in section 6.

Before going live, also settle:

- The upload reliability test described above.
- The retention decision above.
- Live email needs the same authorisation and deliverability check as the booking emails.

## 8. Local tooling (never touches production)

All of these refuse any database that is not on this machine (`backend/scripts/dev/local-db-guard.js`):

```
npm run db:local               start the local Postgres (port 55432)
npm run migration:run:local    apply every migration, advisory ones included, to the local database
npm run start:local            start the built backend on the local database, mock email, throwaway JWT secret
npm run test:advisory          the integration suite (real Postgres, concurrency, permissions)
```
