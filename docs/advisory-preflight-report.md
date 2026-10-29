# Advisory Services: production preflight report (Step 7)

Run 2026-10-28 against release candidate `2998868`. **Read-only throughout:** nothing was pushed, merged, deployed, applied, changed or sent. Production was touched only by SELECT-only database sessions, public GET requests, and read-only Daily GET calls (credentials read in-process, never printed).

## Overall (updated 2026-10-29): READY TO PREPARE THE WINDOW; NOT YET AUTHORISED TO LAUNCH. The two earlier BLOCKED items are resolved (`btree_gist` is installed; the backup is deferred as an explicitly accepted risk). What is left is dashboard confirmations, one policy decision (Daily data residency), the Daily webhook secret, and your explicit authorisation for each production-changing step.

*Owner facts applied: `btree_gist` 1.7 already enabled (verified read-only); AWS access restored and the Lightsail audit complete; `APP_URL=https://www.ruwad.studio` for the release; `FRONTEND_URL` and the Google redirect stay as they are; the manual database backup is deferred (accepted risk, below); release candidate and website appearance unchanged.*

| # | Item | Status |
| --- | --- | --- |
| 1 | Branch, commit, release candidate | **PASS** |
| 2 | Render backend stopped | **ACTION REQUIRED** (not provable from here) |
| 3 | AWS Lightsail environment audit, service configuration, rollback version | **PASS** (audit done; 7 Advisory variables and `APP_URL` to set at the release) |
| 4 | AWS authentication | **PASS** (session valid; no action needed) |
| 5 | Vercel production configuration | **ACTION REQUIRED** (observed from outside: consistent, settings unreadable) |
| 6 | Supabase `btree_gist` installed | **PASS** (1.7 installed, verified read-only 2026-10-29) |
| 7 | Verified, restorable database backup | **ACCEPTED RISK** (deferred by the owner; no backup is assumed to exist; compensating before/after evidence prepared) |
| 8 | Resend domain verification | **ACTION REQUIRED** (DNS consistent, status unreadable) |
| 9 | Daily.co webhook readiness | **PASS** for what can be checked now; secret not yet generated (ACTION) |
| 10 | Exactly four Advisory migrations in the production plan | **PASS** (plan says READY) |
| 11 | Two-pending-request limit and production UI preservation | **PASS** |
| 12 | Remaining launch blockers, including Daily data residency | **ACTION REQUIRED** (see the final checklist, sections B to D; the Daily data-residency decision is still open) |

## Details

### 1. Branch, commit, release candidate: PASS
Branch `feature/advisory-services`. The release candidate is commit `2998868` **plus the launch-tooling and documentation commits that follow it** (no runtime code changed after `2998868`; check with `git diff --name-only 2998868 HEAD`). Working tree clean except the untracked `backend/scripts/seed-real-directory-entities.js` (deliberately left alone). After a read-only `git fetch`, `origin/master` is still `e78d361`: the branch is **26 or more commits ahead (all local) and 0 behind**, so the merge is a fast-forward with no conflicts. The branch has **not** been pushed (no remote branch exists). The GitHub CLI is not installed here, so CI results cannot be read from this machine: when the owner opens the pull request, check that the Actions checks are green before merging.

### 2. Render backend stopped: ACTION REQUIRED
The service name resolves (Render's edge answers), but `/api/health` returned **no response within 100 seconds** on three separate attempts (two at 25 s, one at 100 s). A running free instance wakes in under about a minute and a suspended one normally answers quickly with a 503, so this is consistent with "not running" but is **not proof**. No Render API access exists here. `render.yaml` still declares the service with the default (auto-deploy on) and also declares `ruwad-ml`, which also did not answer.
**Owner:** in the Render dashboard open `ruwad-backend` and confirm the status reads **Suspended** and Auto-Deploy is **Off** (or the service is deleted). Do the same for `ruwad-ml` if it is not meant to run. If the status is anything else, tell me before anything else happens: a running Render backend would try to deploy `master` and run migrations.

### 3 and 4. AWS Lightsail: PASS
AWS authentication was verified (IAM user `ruwad-admin`, profile `ruwad`, region `ap-southeast-2`) and every AWS call below was a read (`sts get-caller-identity`, `lightsail get-container-services`, `get-container-service-deployments`). Nothing was modified. Environment values were never printed (names only; non-secret values and URL hosts where useful).

**Service `ruwad-backend`:** state **RUNNING**, power `micro`, **scale 1** (one instance, so the scheduler will run on exactly one backend), not disabled, no pending next deployment, no custom domain on the service (the public endpoint is the `*.cs.amazonlightsail.com` address; the website reaches it through the Vercel proxy). Container `app`, port 4000, health check `/api/health`.

**Rollback record (write this down):**

| | Version | State | Created | Image |
| --- | --- | --- | --- | --- |
| **Current (rollback target)** | **10** | ACTIVE | 2026-10-27 12:21:21 +03:00 | `:ruwad-backend.api.8` |
| Previous | 9 | INACTIVE | 2026-10-27 10:10:32 +03:00 | `:ruwad-backend.api.7` |

Each environment change and each deploy creates a new version (for example 11 = environment only, 12 = new image). Rolling back means redeploying the configuration of **version 10** (image `api.8` with the environment as it is today), which also removes the Advisory variables.

**Audit result (24 variables set; 9 items to set or fix):**

| Status | Variable | Finding |
| --- | --- | --- |
| OK | `NODE_ENV` | `production` |
| OK | `RUN_MIGRATIONS` | `false` (the container never migrates at start) |
| OK | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL` | set; sender `ruwadplatform@karama.tech`; admin notices go to `ruwadplatform@gmail.com` (the same mailbox that is the default inbox for "new advisor application" emails, so it already receives admin mail) |
| OK | `ADVISORY_MIGRATIONS`, `ADVISORY_AUTOCOMPLETE_ENABLED`, `ADVISORY_MAX_PENDING_REQUESTS`, `DAILY_API_BASE`, `ADVISORY_INTEGRATION` | absent, as required |
| **MISSING** | `ADVISORY_ENABLED`, `ADVISORY_VIDEO_PROVIDER`, `DAILY_API_KEY`, `DAILY_DOMAIN`, `DAILY_WEBHOOK_SECRET`, `ADVISORY_EMAIL_MODE`, `ADVISORY_SCHEDULER_ENABLED` | the 7 Advisory variables, all absent (expected before the release). After the release the service will have 31 variables. |
| **DECISION** | `APP_URL` | already set to `https://ruwad-platform.vercel.app`, **not** `www.ruwad.studio` as the runbook first assumed. It is used only for links inside emails, including the existing platform emails. |
| **NO CHANGE** | `FRONTEND_URL` | `https://ruwad-platform.vercel.app`. **Do not change it:** its first entry also feeds the Google Calendar redirect (`GOOGLE_REDIRECT_URI` is the same address), so editing it could break the existing calendar sign-in. Browser calls reach the API through the site proxy (same origin), so Advisory needs no CORS change. |

**Decision, `APP_URL` (made by the owner): `https://www.ruwad.studio`.** It is set in the same Lightsail environment call as the Advisory variables during the release. Consequence accepted: the links inside the **existing** platform emails also change to the canonical address (`ruwad.studio` already redirects to `www`).

**Audit rules relaxed (tooling only; no runtime code changed):** `FRONTEND_URL` is no longer required to be the `www` address. It now passes while it is set, public https, and still agrees with `GOOGLE_REDIRECT_URI`, and it fails if someone switches it to the `www` address (which would risk Google Calendar sign-in) or clears it. `APP_URL` stays strict, because the www address is now the decision. Re-running the audit against Lightsail (read-only) now reports exactly **8 items**: the 7 missing Advisory variables plus the `APP_URL` switch; `FRONTEND_URL` passes. Tests (`npm run test:ops`, 8 of 8) cover the new rules using today's real values.

**Other observation, not part of this release:** `ML_SCORING_SERVICE_URL` still points the Lightsail backend at `https://ruwad-ml.onrender.com` and `ML_EXPERIMENTAL_INFERENCE_ENABLED` is `true`. That Render service also did not answer in item 2. The scoring call has a 3-second timeout, so existing scoring simply falls back; Advisory does not use it. Mention it only so "Render is stopped" is a known state for the ML service too, rather than a surprise. `DATABASE_URL` points at the Supabase **session pooler on port 5432**, which supports everything the migrations and the per-founder lock need.

### 5. Vercel production configuration: ACTION REQUIRED
No Vercel CLI, token or dashboard access exists here, so the settings cannot be read. What was observed publicly: `www.ruwad.studio` is served by Vercel; the `/api` proxy returns the same body as the Lightsail backend (`{"status":"ok","database":"up"}`), so the proxy target is correct; `/discover/advisory-services`, `/workspace/consultations` and `/admin/advisory` all return 404 and the dashboard HTML has no Advisory nav text, so the live build has the flag **off**, as required.
**Owner (read-only, in the Vercel dashboard):** (a) Settings, Environment Variables: `NEXT_PUBLIC_ADVISORY_ENABLED` must **not** exist yet; `BACKEND_URL` or an absolute `NEXT_PUBLIC_API_URL` points at the Lightsail backend; (b) Settings, Git: the Production Branch is `master` and automatic production deploys are on (the runbook assumes both); (c) Deployments: note the current production deployment, which is the instant-rollback target. Command-line alternative, also read-only: `npx vercel login`, `npx vercel link`, `npx vercel env ls production`.

### 6. Supabase `btree_gist`: PASS
Read-only on production (2026-10-29): `btree_gist` **1.7 is installed** (schema `extensions`); `pg_available_extensions.installed_version` is 1.7. The role's `search_path` is `"$user", public, extensions`, and the booking constraint uses the default operator classes (`gist_uuid_ops`, `gist_timestamptz_ops`, both present), so it needs no explicit name. The migration's `CREATE EXTENSION IF NOT EXISTS btree_gist` is a no-op. The blocker is removed.

### 7. Database backup: ACCEPTED RISK (deferred by the owner, 2026-10-29)
**No recoverable backup is assumed to exist.** Supabase's own automatic backups were not verified and are not relied on. The owner has chosen to defer the separate manual dump; for planning purposes this is an explicitly accepted operational risk (see "Remaining risks"). It can be reversed at any time before the migration window: the dump needs the PostgreSQL client tools (version 17 or newer; none are installed on the working machine), and I would restore-test it locally.
**Compensating evidence (read-only, not a backup):** `backend/scripts/ops/prod-snapshot.js` records, per table, the row count and a SHA-256 fingerprint of the schema (no row data). A baseline was taken on 2026-10-29: **66 tables, 1,536 rows, 37 migrations, extensions btree_gist 1.7, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp.** Run it again right before the migration window, and `compare` afterwards: it must print `EXISTING SCHEMA UNCHANGED`. Rehearsed on a scratch copy: it passed after the four migrations (only the 11 `advisory_*` tables added, nothing existing changed) and correctly failed when I altered an existing table. The migration command itself will carry `BACKUP_REFERENCE="NO-BACKUP-OWNER-ACCEPTED-RISK-<date>"`, which the guard records in its output.

### 8. Resend domain verification: ACTION REQUIRED
The Resend API key is **send-only** (the API answered `restricted_api_key` to a domain listing), so verification status cannot be read. Public DNS for the sender domain `karama.tech` is consistent with a configured Resend domain: a DKIM record exists at `resend._domainkey.karama.tech`; `send.karama.tech` has SPF and MX records; the root has an SPF record for Google and a DMARC policy (`p=none`). DNS alone cannot show the "Verified" state.
**Owner:** open resend.com/domains, find `karama.tech`, and confirm it says **Verified** with Sending enabled. Also confirm `EMAIL_FROM` uses that domain (the local `.env` does; Lightsail's value is part of item 3).

### 9. Daily.co webhook readiness: PASS (open: secret file, billing)
Re-checked 2026-10-29, read-only: the API key is accepted for the domain `ruwadstudio`; **0 webhooks, 0 rooms**; the webhook route does not exist on production yet (404, expected before the release); no probe and no registration was sent. **The webhook secret does not exist yet** (`~/secure/daily-webhook-secret.txt` not found), and neither does a key file at `~/secure/daily-api-key.txt` (the production key currently lives only in `backend/.env`; the launch scripts read it from the environment or a file). Create the secret with `node backend/scripts/ops/daily-webhook-production.js gen-secret "$HOME\secure\daily-webhook-secret.txt"` (writes a 32-byte secret, never prints it, refuses to overwrite). The webhook is registered only after the backend answers the probe with 401. Daily billing/payment method for webhooks is still to be confirmed in the Daily dashboard.

### 10. Exactly four Advisory migrations: PASS
Production plan (read-only, re-run 2026-10-29): PostgreSQL 17.6; `btree_gist` installed; **4 expected, 0 applied, 4 pending, status READY**: `CreateAdvisoryServices1794300000000`, `AdvisoryAutomationAndMeetings1794400000000`, `AdvisorApplications1794500000000`, `AdvisoryPresenceEvents1794600000000`, in that order, in one transaction. No other migration is pending and none of the 37 existing migration files changed.

### 11. Two-pending-request limit and UI preservation: PASS
Re-verified 2026-10-29 (cap tests 7 of 7; no runtime code changed since `2998868`). At that commit: the 7 limit tests pass (including 8 simultaneous requests and many founders at once). All **46 restored files are byte-identical to production `master`** (0 differ), including `standards.css` and `PageHeader.tsx`; the only non-Advisory frontend files that differ are the 13 documented ones (Next 16.4.3 in `package.json`, local-only scripts, the four Advisory page routes, one stylesheet import in `layout.tsx`, two icons, `WorkspaceGate`, `feature-flags`, `nav-config`). The earlier side-by-side comparison (90 of 90 captures identical on 45 pages at desktop and phone width) is unchanged because no frontend file has changed since.

## Final checklist (2026-10-29)

### A. Already completed
- Release candidate: branch `feature/advisory-services`, up to date with `origin/master` (`e78d361`: 0 behind, fast-forward merge), not pushed. **Runtime code is unchanged since `2998868`**; everything after it is launch tooling and documentation.
- Production website appearance: all 46 restored files are byte-identical to production; 90 of 90 side-by-side captures (45 pages, desktop and phone width) were identical.
- Two-pending-request limit: built, 7 tests pass (including simultaneous requests), re-run today.
- `btree_gist` 1.7 installed in production (read-only query). Migration plan READY, exactly the four Advisory migrations.
- AWS: access restored, Lightsail audit complete. Service RUNNING, micro, scale 1; **deployment 10 ACTIVE (image `api.8`) is the rollback target**; previous 9 (`api.7`). Present and correct: `NODE_ENV`, `RUN_MIGRATIONS=false`, Resend key, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`; `FRONTEND_URL`, `GOOGLE_REDIRECT_URI`, `PUBLIC_API_URL` unchanged and untouched by the release.
- **Exact environment change prepared and dry-run verified** against the real service (names only, nothing deployed, still version 10): 7 variables **added**, 1 **updated**, nothing else. Details below.
- Daily: key valid for `ruwadstudio`, 0 webhooks, 0 rooms, HIPAA add-on off. Vercel flag confirmed **off** in the live build; Advisory routes absent (404) on both the site and the backend; backend health 200.
- Resend: sender `ruwadplatform@karama.tech`; DNS records for DKIM, SPF and MX exist (indicative only).
- Production before/after baseline snapshot taken (read-only); guarded tools ready: `advisory-migrate.js`, `prod-snapshot.js`, `lightsail-advisory-env.js`, `daily-webhook-production.js`, `lightsail-env-audit.js`; ops tests 10 of 10.

### The exact production environment change (prepared, NOT executed)
Applied in ONE Lightsail deployment (version 11, the same image `api.8`), then the merge creates the next version with the new image and the environment preserved.

| Variable | Change | Value | Source |
| --- | --- | --- | --- |
| `ADVISORY_ENABLED` | add | `true` | fixed |
| `ADVISORY_VIDEO_PROVIDER` | add | `daily` | fixed |
| `DAILY_DOMAIN` | add | `ruwadstudio` | fixed (matches the account) |
| `ADVISORY_EMAIL_MODE` | add | `live` | fixed |
| `ADVISORY_SCHEDULER_ENABLED` | add | `true` | fixed (one backend only) |
| `DAILY_API_KEY` | add | secret | owner's password manager or `~/secure/daily-api-key.txt`; validated against the Daily account before use |
| `DAILY_WEBHOOK_SECRET` | add | secret, base64, 32 bytes | generated by `gen-secret`; the same value is later given to Daily |
| `APP_URL` | **update** | `https://www.ruwad.studio` (now `https://ruwad-platform.vercel.app`) | owner decision; also changes links in existing platform emails |

Never touched: `FRONTEND_URL`, `GOOGLE_REDIRECT_URI`, `PUBLIC_API_URL`, `DATABASE_URL`, every other existing variable. Must stay absent: `ADVISORY_MIGRATIONS`, `ADVISORY_AUTOCOMPLETE_ENABLED`, `ADVISORY_MAX_PENDING_REQUESTS`. Frontend (Vercel): `NEXT_PUBLIC_ADVISORY_ENABLED=true`, added last (a build-time value, then redeploy).

### B. Items you must confirm in dashboards
1. **Render:** `ruwad-backend` is **Suspended** with Auto-Deploy **Off** (or deleted); decide about `ruwad-ml` (the backend's ML scoring still points at it; it does not answer).
2. **Vercel:** `NEXT_PUBLIC_ADVISORY_ENABLED` does not exist yet; Production Branch is `master` with automatic production deploys on; note the current production deployment (instant-rollback target); `BACKEND_URL` / `NEXT_PUBLIC_API_URL` unchanged.
3. **Resend:** `karama.tech` shows **Verified**, sending enabled (the API key is send-only, so I cannot read this).
4. **Daily:** a payment method is on the account if webhooks need one; set a usage alert; domain `ruwadstudio` is the one to use.
5. **Mailbox:** `ruwadplatform@gmail.com` (new-application and admin notices) is read by someone; a second real account exists for the smoke test (admin account already belongs to a startup).
6. **Supabase (informational only, nothing relies on it):** whether your plan lists automatic backups or point-in-time recovery, and the latest time.

### C. Production-changing actions that need your explicit authorisation (none has been run)
Local preparation, no production effect: create the Daily webhook secret file; `aws login --profile ruwad` (the session expires after a few hours: log in again right before the window, then I re-run the audit and the wrapper's `plan`, which could not reach Lightsail tonight).

| # | Action | Command / who | Reversible by |
| --- | --- | --- | --- |
| 0 | Read-only fresh baseline snapshot | `prod-snapshot.js take` | n/a (read-only) |
| 1 | **Apply the 4 Advisory migrations** (one transaction) | `advisory-migrate.js apply` with `BACKUP_REFERENCE="NO-BACKUP-OWNER-ACCEPTED-RISK-<date>"` and the exact confirmation phrase | reverting the migrations (drops advisory data; no backup exists) |
| 2 | **Lightsail environment**: 7 added, `APP_URL` updated (deployment 11) | `lightsail-advisory-env.js plan` then `apply` with its confirmation phrase | redeploy version 10 |
| 3 | **Merge to `master`** (you, not me): backend image deploys; Vercel builds with the flag still off | GitHub | redeploy version 10 / previous Vercel deployment |
| 4 | **Register the Daily webhook** (only after the probe answers 401) | `daily-webhook-production.js register` | `delete <uuid>` |
| 5 | **Vercel**: add `NEXT_PUBLIC_ADVISORY_ENABLED=true`, redeploy | Vercel dashboard (you) | remove the variable and redeploy, or promote the previous deployment |
| 6 | **Live smoke test**: real application, real room, **real emails** to your accounts | runbook section 8 | suspend the canary advisor (data kept) |

### D. Remaining compliance and recovery risks
1. **No backup (accepted by the owner):** if existing data were ever damaged there is no verified copy to restore. Mitigations: migrations are additive, in one transaction, rehearsed on a production-equivalent copy, and checked afterwards by the schema-fingerprint comparison; do no manual database edits during the window. You can still take a dump at any time before step 1.
2. **Daily.co data residency / data protection: NOT YET DECIDED.** Daily is a US provider; rooms are not region-pinned; the HIPAA add-on is off; nothing is recorded; Daily receives the user's opaque id, display name, room name and times. Needs your (and counsel's) explicit approval, or an instruction to add region pinning first. This remains a launch blocker until you decide.
3. **Email:** Resend domain status unconfirmed (item B3). `APP_URL` change also rewrites the links in existing platform emails (accepted).
4. **Daily webhook never exercised against production** (protocol proven locally in Step 4); billing unconfirmed.
5. **Render not provably stopped** (item B1); `ruwad-ml` unresponsive (existing scoring falls back after 3 seconds).
6. **Operational:** AWS login expires within hours (re-login before the window); single `micro` instance (brief connection resets during a deployment swap); local tests ran on PostgreSQL 18.4 while production is 17.6; GitHub CI results cannot be read from here (check the pull request's checks before merging); Vercel auto-build on merge is assumed (item B2).

**Nothing production-changing will happen until you explicitly authorise each step in section C.**
