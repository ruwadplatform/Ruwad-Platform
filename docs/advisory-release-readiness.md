# Advisory Services — attendance accuracy and release readiness (Step 5)

Status: local review on branch `feature/advisory-services`. Nothing here has been pushed, deployed, merged into `master`, or applied to production. Production was read only (one read-only session, SELECT only, masked output).

## 1. Recommendation

**CONDITIONAL GO, in two stages.**

| Stage | Verdict | Meaning |
| --- | --- | --- |
| A. Merge and deploy with every Advisory switch OFF ("dark deploy") | **GO**, once the owner accepts two side effects that are not Advisory (section 6) | Proven inert: no migration runs, no advisory route answers, no nav item, no scheduler, no email, no Daily call. |
| B. Switch the feature ON for real users | **NO-GO until the gates in section 8 are closed** | The code is ready and tested; what is missing is production configuration, one controlled migration window, a registered webhook reachable from Daily, and three owner decisions. |

Nothing found in this review blocks stage A. Nothing found is a security defect in the Advisory code. The one product risk worth a decision before stage B is the missing cap on simultaneous pending requests (section 5).

## 2. Attendance accuracy

**Finding.** Attendance was stored as one span per Daily `session_id`. Daily's `joined_at` and `duration` always describe the *first* join of a session and its duration covers the gaps, so after a reconnect the span included the time the person was disconnected. In the real Step 4 sessions:

| Person | Span (old result) | Connected (now) | Wrongly counted as present |
| --- | --- | --- | --- |
| Founder (one 10 s drop) | 137.8 s | 127.6 s | 10.2 s |
| Advisor (background tab, five stretches) | 467.0 s | 279.3 s | 187.7 s |

Step 4's dedupe fix also turned out to be incomplete: a rejoin carries the first join's `joined_at`, so keying on it could still swallow a rejoin.

**Fix.** Store the events, derive the time.
- New table `advisory_presence_events` (migration `1794600000000-AdvisoryPresenceEvents`, opt-in like the others): one row per distinct join or leave, unique on (booking, user, session, kind, event time).
- `deriveSegments(events)` (pure, in `attendance-logic.ts`) orders a session's events by their own time and returns connected stretches. Duplicate events collapse, a join while already joined is ignored, a leave without a join becomes a stretch from the session's first join (marked inferred) or is dropped, a trailing join stays open.
- Stretches are written to the existing `advisory_meeting_attendance` rows (keys `S`, `S#1`, ...). The webhook marker, the event row and the stretches are written in one transaction under a per-session advisory lock.
- Founder and advisor are independent. "Together in the room" is the overlap of the two sets of stretches, i.e. actual simultaneous attendance.
- Unchanged: the summary, the 5-minute rule, Needs Review, and completion (advisor or admin only; auto-complete stays off).

**What Daily data cannot tell us.** Daily's events carry no heartbeat, only joins and leaves. If a connection dies silently, the leave can only be recorded when Daily itself notices, so connected time can run a little long by that delay (not measured here). That is Daily's resolution; the fix does not invent precision beyond it, and a reconnection never double-counts.

**Evidence.** Regression tests use the captured numbers (founder 122.045 s + 5.577 s; advisor 5 stretches, 279.316 s of a 467.04 s span), all 24 arrival orders of the founder's events, and 200 shuffled, double-delivered orders of the advisor's ten events. Two integration tests replay both sessions through the signed webhook endpoint. They fail on the old code and pass now.

## 3. Feature readiness checklist

Method: 60-step journey through the real HTTP API on a production-equivalent database (schema compared with production, then the four advisory migrations applied), plus a browser walk of the pages for each role. Result: **60 of 60 checks passed, 1 observation.**

| Workflow | State | Notes |
| --- | --- | --- |
| Public directory and advisor profile | Ready | Public, 404 for unknown advisor, no contact details, user id, notes or documents exposed (21 public fields). |
| Apply as Advisor | Ready | Validation lists every problem; CV required; one open application per user (409); status tracker for the applicant; documents stored in the database, not on disk. |
| Admin review, approve, reject, reapply | Ready | Reject needs a reason of at least 10 characters (enforced in API and UI); Edit and Reapply returns to review; reapply while not rejected is refused; CV downloads as an attachment; applicant cannot use the admin route. |
| Advisor profile, services, availability, time off | Ready | Overlaps and bad ranges refused; pending and suspended advisors lose advisor routes. |
| Booking | Ready | Double booking refused (exclusion constraint); non-members of the startup cannot book for it; an advisor cannot book themselves; unrelated users cannot read a booking. |
| Confirmation, decline, cancellation | Ready | Cancelled slot is offered again; request expiry and reminders exist but the scheduler is off by default. |
| Video access | Ready (mock proven; real Daily proven in Step 4) | Opens in the allowed window only; recording off; room private. |
| Attendance | Ready after this fix | Section 2. |
| Completion and review | Ready | Only advisor or admin can conclude; founder gets 403; Needs Review pass never auto-completes. |
| Notifications and history | Ready | Booking and application decisions recorded in history; mock mode says so ("nothing was sent"); no secrets in history. |
| Suspension | Ready | Directory entry and advisor access removed at once. |
| Admin console | Ready | Advisors, Applications, Bookings, Needs review, Statistics, Automation tabs load. |
| Frontend with the flag off | Ready | All 7 Advisory pages return 404, nav item hidden, SEO entries gated on the same flag. |

Incomplete or confusing states found (none blocks release):
1. No cap on simultaneous PENDING requests per founder (section 5).
2. Admin Applications tab counters (Pending, Approved, Rejected) do not add up to "All" when a suspended advisor exists (that advisor is in "All" only). Cosmetic.
3. In mock mode application decisions are recorded in history as notifications, correctly. No other gaps. (An earlier suspected gap was an artifact of a scratch database with the wrong character encoding; production and the local dev database are UTF-8.)

## 4. Production readiness inventory

**Migrations (four, all opt-in).** `1794300000000 CreateAdvisoryServices` (includes `CREATE EXTENSION IF NOT EXISTS btree_gist`), `1794400000000 AdvisoryAutomationAndMeetings`, `1794500000000 AdvisorApplications`, `1794600000000 AdvisoryPresenceEvents`. They are only visible to the TypeORM CLI when `ADVISORY_MIGRATIONS=true`, so an ordinary deploy never applies them.

**Production database (read-only check).** PostgreSQL 17.6; last applied migration `AddAiSummaryWebSources1794200000000` (the same as `master`'s latest, so the advisory migrations are the only pending ones); no advisory tables; `btree_gist` is **available but not installed**; the application role is **not a superuser**; 1 active admin account. Schema compared with a database built from `master` migrations only: identical. Advisory migrations applied and fully reverted cleanly on that copy, and touch no non-advisory table (the only shared object is the extension).

**Environment variables (backend).**

| Variable | Needed for | Safe default |
| --- | --- | --- |
| `ADVISORY_ENABLED=true` | Advisory routes at all | off: routes inert |
| `NEXT_PUBLIC_ADVISORY_ENABLED=true` (Vercel, **build time**) | UI pages, nav, SEO | off: 404 |
| `ADVISORY_MIGRATIONS=true` | only the migration command, not the running service | off |
| `ADVISORY_EMAIL_MODE=live` plus `RESEND_API_KEY`, `EMAIL_FROM` (verified sender), `APP_URL` | real emails | mock (anything but exactly `live` is mock) |
| `ADVISORY_APPLICATIONS_EMAIL` | where new applications are announced | defaults to `ruwadplatform@gmail.com` |
| `ADVISORY_VIDEO_PROVIDER=daily`, `DAILY_API_KEY`, `DAILY_DOMAIN` | real rooms | mock (simulated rooms); "daily" without credentials reports not configured, never silently fake |
| `DAILY_WEBHOOK_SECRET` (base64), optional `DAILY_WEBHOOK_TOLERANCE_SECONDS` (default 300) | accurate attendance | the webhook route answers 404 without it |
| `ADVISORY_SCHEDULER_ENABLED=true` | expiry, reminders, Needs Review pass; enable on **one** backend only (AWS), see below | off |
| `ADVISORY_MEETING_OPENS_MINUTES`, `_CLOSES_MINUTES`, `_MAX_PARTICIPANTS`, `_CLEANUP_MINUTES`, `ADVISORY_REQUEST_EXPIRY_HOURS`, `_CUTOFF_MINUTES`, `_EXPIRY_WARNING_HOURS`, `ADVISORY_REVIEW_GRACE_MINUTES`, `ADVISORY_ATTENDANCE_MIN_MINUTES` | tuning (defaults 10 / 15 / 4 / 60; 72 / 30 / 24; 30 / 5) | leave at defaults |
| `ADVISORY_AUTOCOMPLETE_ENABLED` | automatic completion | **off, not approved; leave off** |
| `NODE_ENV=production` | Swagger (`/api/docs`) is served only when this is not `production` | verify it is set |

`APP_URL` defaults to `http://localhost:5174`; if it is not set in production, links in emails would point at localhost. It must be set before `ADVISORY_EMAIL_MODE=live`.

**Deployment topology.** Backend: GitHub Actions to AWS Lightsail (triggers on `master` pushes touching `backend/**`, waits for ACTIVE and `/api/health`; it copies the running container's environment, so variables are set in the Lightsail console, not in the repository). The Lightsail container runs with `RUN_MIGRATIONS=false` because `render.yaml` still describes a Render backend whose start command (`npm run deploy:start`) runs `migration:run`. Frontend: Vercel with the `/api/*` proxy. **Open item for the owner: confirm whether the Render backend is still live and auto-deploying from `master`.** If it is, it is the process that applies migrations on start; neither service may have `ADVISORY_MIGRATIONS=true` in its runtime environment (section 7 applies the migrations by hand instead).

**Endpoint security (54 routes inventoried).** Every Advisory route except the public directory, public profile, slots, and the Daily webhook requires a session; advisor routes require an approved advisor; admin routes require `RUWAD_ADMIN`; booking and meeting routes check membership of the booking's startup or the advisor's identity. The webhook is public by necessity and is protected by HMAC-SHA256 over `timestamp.rawBody`, a replay window, and idempotency by event id. Sessions are bound to the user id and re-read from the database, so suspended and deleted users lose access at once (21/21 auth checks). Applicant documents are only reachable through the admin route.

**Admin access.** One active `RUWAD_ADMIN` account exists in production. Application and booking notifications go to `ADVISORY_APPLICATIONS_EMAIL` and `ADMIN_NOTIFICATION_EMAIL`.

## 5. Unresolved bugs and risks

| # | Item | Severity | Recommendation |
| --- | --- | --- | --- |
| 1 | No per-founder cap on simultaneous PENDING requests: six more were accepted on top of earlier ones. Each holds a slot until it expires (at most 72 h, and never later than 30 min before the start). One user could hold many of an advisor's slots with unanswered requests. | Medium (abuse and nuisance, no data exposure) | Decide a cap (for example 3 open requests per founder per advisor). Not changed here because it is a booking rule. Easy to add as a follow-up with a test. |
| 2 | Rate limits are in memory per instance (apply: 10 per hour per visitor). A restart resets them; a second instance would double them. | Low | Acceptable for one instance. |
| 3 | Daily's silent-disconnect timeout can make connected time run slightly long (section 2). | Low | Inherent to Daily's events. |
| 4 | Admin Applications counters cosmetic mismatch. | Cosmetic | Optional follow-up. |
| 5 | Live email has never been exercised with Resend from this branch (mock only, by instruction). | Medium for stage B | Send one email to an owner-controlled address after switching to live (gate G5). |
| 6 | A real Daily webhook delivery to the production backend has not been exercised. Step 4 proved the protocol through a tunnel to a local copy. | Medium for stage B | Gate G4. |
| 7 | **Saudi data-protection and data-residency review** for a US-based video provider is still open (carried over from `advisory-production-readiness.md`, section 6). Meetings are not recorded and carry a notice against sharing patient-identifiable information; the HIPAA add-on was not bought. | Policy, for stage B | Owner and counsel decision before live activation. |
| 8 | Daily requires a card on file and has no spending cap; `@daily-co/daily-js` depends on `@sentry/browser`, so it can report errors to a third party. | Low | Set a Daily usage alert; review the Sentry dependency before live activation. |
| 9 | `btree_gist` is not installed in production and the role is not a superuser. It is a trusted extension on PostgreSQL 13 and later, so the database owner can normally create it, but this was not rehearsed with that exact role. | Low, but it would abort the migration | Install it from the Supabase dashboard before the window (section 7, step 2). |

No security defect was found. No secret appears in any log, capture, history entry, document or the diff (scanned).

## 6. Deployment safety: what else changes when this branch reaches production

Branch compared with `origin/master`: 23 commits ahead. Most are Advisory work; two older UI commits and a few other changes ride along and are listed below.

**Commits `0cad289` and `b38e650` (not in production `master`).** Production `master` already contains `cb6ee94` ("Standardize the UI across the platform"), which changed the **desktop** look. These two commits are the follow-up:
- `0cad289` "Restore the previous desktop appearance; keep the standards for phones only": reverts desktop to the pre-standardization look and confines the standards to the 760 px phone breakpoint. Concretely, on desktop it restores card heading size and spacing (14 px and 12 px back to the original 13 or 15 px and 0, 4 or 16 px), dashboard panel titles (14 px back to 16 px), stat-card label line height, entity names (24 px back to 20 or 26 px), page-header wrapper margins, empty-state spacing, and grey instead of blue borders and 38 px instead of 40 px inputs on 16 pages. It gives `PageHeader` a `variant="block"` and restores each card's original class names. 46 frontend files, all cosmetic (class names and wrappers) plus `styles/standards.css`; no API, schema, auth, scoring, validation or payload change; nothing outside `frontend/src`.
- `b38e650` "Phones: lift the chat button above the three-row Edit bar; last odd stat card spans the row": two rules inside the phone breakpoint in `standards.css` (7 lines).

**Net effect for users today:** the platform's desktop pages visibly change back from what production shows now (the post-`cb6ee94` look) to the earlier look; phones keep the standards and gain two small fixes. This is the largest visible non-Advisory change in the deploy.

**Other non-Advisory changes in the branch:** Next.js 16.4.0 to 16.4.3 with `eslint-config-next` (`cb23f9e`, a security upgrade); the RUWAD logo as the browser tab icon (`64ca303`); local-development tooling that production never executes (`3a3cd2b`, scripts and guards under `backend/scripts/dev` and `src/dev-tooling`).

**Backend with the flags off.** Proven: no advisory migration is applied; the Advisory module's routes are inert; the scheduler does not start; no email and no Daily call is made; the other 1,150 backend tests pass, including auth. `CREATE EXTENSION btree_gist` is the only operation outside the advisory tables and happens only in the migration window.

**Decision for the owner:** either accept the UI revert as part of this deploy, or ship the two UI commits separately first so each change is reviewed on its own.

## 7. Production migration plan (to be executed only after approval)

Nothing below has been run against production.

1. **Window and backup.** Pick a quiet window. Take a Supabase backup or note the point-in-time-recovery timestamp. Confirm the last applied migration is `AddAiSummaryWebSources1794200000000`.
2. **Pre-install the extension.** In the Supabase dashboard (Database, Extensions) enable `btree_gist`. This removes the only privilege risk from the migration. (`CREATE EXTENSION IF NOT EXISTS` is then a no-op.)
3. **Deploy first, dark.** Merge and deploy with `ADVISORY_ENABLED` unset on the backend and `NEXT_PUBLIC_ADVISORY_ENABLED` unset on Vercel. Verify `/api/health` and the normal site.
4. **Apply the four migrations together, by hand, from a controlled shell**, not from a service start: run the TypeORM `migration:run` for the compiled data source with `ADVISORY_MIGRATIONS=true` set for that one command only. Expect exactly four `executed` lines (1794300000000 to 1794600000000). They are additive: new tables, enums, indexes and constraints; no existing table or row is touched.
5. **Verify read-only:** four new migration rows, the `advisory_*` tables exist, row counts all zero, existing table counts unchanged.
6. **Do not** put `ADVISORY_MIGRATIONS=true` in any service's runtime environment (it would only be harmless once the migrations are applied, but it removes the safeguard).

Rollback of the schema: the `down()` of each migration drops the advisory tables in reverse order (tested on the production-equivalent copy). That loses advisory data, so it is only appropriate before real use; after real use, prefer turning the feature off (section 9) and leaving the tables.

## 8. Gates before switching the feature on (stage B)

- G1. Owner confirms whether Render is still live and who runs migrations (section 4).
- G2. Migrations applied and verified (section 7).
- G3. Owner decision on the pending-request cap (section 5, item 1).
- G4. Daily webhook registered and a real delivery confirmed (section 10).
- G5. Live email: `RESEND_API_KEY`, `EMAIL_FROM` (verified sender), `APP_URL`, `ADVISORY_APPLICATIONS_EMAIL` set; one email to an owner-controlled address.
- G6. Daily production variables set (`ADVISORY_VIDEO_PROVIDER=daily`, `DAILY_API_KEY`, `DAILY_DOMAIN`, `DAILY_WEBHOOK_SECRET`) and the Daily domain decision made (a separate domain for testing is advisable so a leftover test webhook can never receive production events).
- G7. Owner accepts or splits the UI commits (section 6).
- G8. Owner and counsel have decided the Saudi data-protection and data-residency question for the video provider (risk 7), and a Daily usage alert is set.
- G9. First real advisor onboarded through the application form and approved by the owner; the directory is empty until then (the demo seeder was removed).

Enable in this order: backend `ADVISORY_ENABLED=true` (scheduler and auto-complete still off), then Vercel `NEXT_PUBLIC_ADVISORY_ENABLED=true` and a redeploy (it is a build-time value), then live email, then the scheduler (on the AWS backend only, never on both) after one supervised day.

## 9. Deploy and rollback plan

**Deploy.** Merge, let the existing workflow run, wait for ACTIVE and a 200 from `/api/health`; Vercel deploys the frontend. Stage A needs no environment change.

**Rollback, fastest first.**
1. Feature off: unset `ADVISORY_ENABLED` on the backend (routes inert again, scheduler stops) and `NEXT_PUBLIC_ADVISORY_ENABLED` on Vercel, then redeploy the frontend. Data is kept. Takes minutes, loses nothing.
2. Code rollback: redeploy the previous Lightsail deployment from the Lightsail console (the previous container image is retained) and use Vercel's "Promote" on the previous deployment. Because the advisory migrations are additive and the previous code does not know the tables, the old code runs fine against the new schema.
3. Schema rollback (last resort, before real use only): the four `down()` migrations in reverse order, from a controlled shell. Do not do this after real consultations exist.
4. Daily: delete the registered webhook (the endpoint then simply receives nothing); room cleanup is not needed because rooms expire.

## 10. Daily.co webhook setup plan (to be executed only after approval)

Requirements verified live in Step 4:
- Public HTTPS URL on the Lightsail backend: `https://<backend>/api/advisory/webhooks/daily` (Daily must reach it from the internet). It must answer HTTP 200 to Daily's creation-time test ping within 8 seconds.
- Create the webhook with `hmac` (the base64 secret becomes `DAILY_WEBHOOK_SECRET`), event types `participant.joined` and `participant.left`, retry type exponential. Set the secret on the backend **before** registering.
- Signature is HMAC-SHA256 over `timestamp.rawBody` using the base64-decoded secret; `X-Webhook-Timestamp` is in milliseconds; the default 300 s tolerance covers Daily's retries (observed about 3.6 s).
- Idempotency is by event id (retries keep the id), then by the event ledger; out-of-order and duplicate events are safe.
- Use a separate Daily domain for any testing; delete any test webhook before production use; verify afterwards with a read-only list that exactly one webhook points at production.
- Verification after registration: create one disposable consultation with two owner-controlled participants, join, leave, rejoin, and compare the recorded stretches with Daily's own record. Then delete the test data.

## 11. Verification run for this step

| Check | Result |
| --- | --- |
| Backend type-check (build and full tsconfig), build, lint of `src/advisory`, `src/dev-tooling`, `src/database` | clean |
| Backend unit suite | 1,150 passed, 3 DB-backed suites skipped (they run in the next lines) |
| Advisory integration (`npm run test:advisory`), also with hostile fake production-style variables | 122 of 122, both times |
| Visibility integration | 19 of 19 |
| Auth end to end (register, login, suspended, deleted, admin) | 21 of 21 |
| Journey audit through the real API on the production-equivalent database | 60 of 60, 1 observation |
| Frontend type-check, lint (0 errors, 9 pre-existing warnings), unit tests | clean, 85 of 85 |
| Browser walk: directory, apply form, founder consultations and detail, advisor dashboard, admin Advisors and Applications, reject dialog | pages load, no unexpected API errors |
