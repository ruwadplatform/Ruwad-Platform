# Advisory Services: production preflight report (Step 7)

Run 2026-10-28 against release candidate `2998868`. **Read-only throughout:** nothing was pushed, merged, deployed, applied, changed or sent. Production was touched only by SELECT-only database sessions, public GET requests, and read-only Daily GET calls (credentials read in-process, never printed).

## Overall: NOT READY TO LAUNCH TODAY. Two items are BLOCKED (`btree_gist`, backup) and several need an action or a decision from the owner. The code, the release candidate and the AWS side are in order.

*Updated after the owner signed in to AWS (`ruwad` profile, `ap-southeast-2`): items 3 and 4 are now done; see the new findings in item 3. **Owner decisions recorded:** `APP_URL` will be `https://www.ruwad.studio` (set during the release), and the audit rules were relaxed (below).*

| # | Item | Status |
| --- | --- | --- |
| 1 | Branch, commit, release candidate | **PASS** |
| 2 | Render backend stopped | **ACTION REQUIRED** (not provable from here) |
| 3 | AWS Lightsail environment audit, service configuration, rollback version | **PASS** (audit done; 7 Advisory variables and `APP_URL` to set at the release) |
| 4 | AWS authentication | **PASS** (session valid; no action needed) |
| 5 | Vercel production configuration | **ACTION REQUIRED** (observed from outside: consistent, settings unreadable) |
| 6 | Supabase `btree_gist` installed | **BLOCKED** (not installed) |
| 7 | Verified, restorable database backup | **BLOCKED** (none verified; no tooling here) |
| 8 | Resend domain verification | **ACTION REQUIRED** (DNS consistent, status unreadable) |
| 9 | Daily.co webhook readiness | **PASS** for what can be checked now; secret not yet generated (ACTION) |
| 10 | Exactly four Advisory migrations in the production plan | **PASS** (execution gated by item 6) |
| 11 | Two-pending-request limit and production UI preservation | **PASS** |
| 12 | Remaining launch blockers, including Daily data residency | **ACTION REQUIRED** (list below) |

## Details

### 1. Branch, commit, release candidate: PASS
Branch `feature/advisory-services`, HEAD `2998868`, working tree clean except the untracked `backend/scripts/seed-real-directory-entities.js` (deliberately left alone). After a read-only `git fetch`, `origin/master` is still `e78d361`: the branch is **25 commits ahead and 0 behind**, so the merge is a fast-forward with no conflicts. The branch has **not** been pushed (no remote branch exists). The GitHub CLI is not installed here, so CI results cannot be read from this machine: when the owner opens the pull request, check that the Actions checks are green before merging.

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

### 6. Supabase `btree_gist`: BLOCKED
Read-only query on production: `btree_gist` is **available (version 1.7) and not installed**. Installed extensions: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`. The migration guard refuses to apply until it is installed.
**Owner:** Supabase dashboard, Database, Extensions, enable `btree_gist` (or SQL editor: `CREATE EXTENSION IF NOT EXISTS btree_gist;`). It is harmless to the running site. Then tell me and I will re-run the plan.

### 7. Verified, restorable database backup: BLOCKED
No backup has been verified, and none is assumed. Facts: the production database is small (**24 MB**, 66 public tables, 37 migrations recorded), so a full dump is quick. There is **no `pg_dump`/`pg_restore` on this machine** (the PostgreSQL 16 and 18 folders under Program Files are empty and the embedded server ships only `pg_ctl`). No Supabase access token exists in `backend/.env`, so Supabase's own backup list cannot be read from here. Supabase's automatic backups depend on the plan and are not a verified, restorable copy.
**What "verified" will mean:** (1) a dump file exists, taken with a client at least as new as the server (17.6); (2) `pg_restore --list` reads it; (3) it is **restored into a scratch database and the table row counts match production** (I can do step 3 locally on request).
**Owner, either way:** install the PostgreSQL command-line tools (version 17 or 18; the "command line tools" component is enough), then run `pg_dump --format=custom --no-owner "<direct connection string, port 5432>" -f ruwad-pre-advisory-YYYYMMDD.dump`, keep a copy off this machine, and give me the file's path. I will then restore it into a throwaway local database and compare counts. **Option for me, needing your approval:** I can take that dump myself once a client is installed; it exports real production data (including the administrator's password hash) to a local file, so I will not do it without your explicit go-ahead. If your Supabase plan lists backups or point-in-time recovery, note the latest timestamp as well, but treat it as a second copy, not as the verified one.

### 8. Resend domain verification: ACTION REQUIRED
The Resend API key is **send-only** (the API answered `restricted_api_key` to a domain listing), so verification status cannot be read. Public DNS for the sender domain `karama.tech` is consistent with a configured Resend domain: a DKIM record exists at `resend._domainkey.karama.tech`; `send.karama.tech` has SPF and MX records; the root has an SPF record for Google and a DMARC policy (`p=none`). DNS alone cannot show the "Verified" state.
**Owner:** open resend.com/domains, find `karama.tech`, and confirm it says **Verified** with Sending enabled. Also confirm `EMAIL_FROM` uses that domain (the local `.env` does; Lightsail's value is part of item 3).

### 9. Daily.co webhook readiness: PASS (with two open actions)
Read-only: the API key is valid; the account domain is `ruwadstudio`; **0 webhooks and 0 rooms** exist; the HIPAA add-on is off (as decided); the webhook route does not exist on production yet (404, as expected before the release). Not done, on purpose: no production webhook was registered and no probe was sent. Open actions: (a) the webhook secret has **not been generated** (the file `$HOME\secure\daily-webhook-secret.txt` does not exist): run `node backend/scripts/ops/daily-webhook-production.js gen-secret "$HOME\secure\daily-webhook-secret.txt"` when ready; (b) Daily may require a payment method on the account for webhooks and has no spending cap: confirm billing and set a usage alert in the Daily dashboard (creation would fail with a clear message otherwise; the script re-checks before it registers).

### 10. Exactly four Advisory migrations: PASS
Production plan (read-only): 4 expected (`CreateAdvisoryServices1794300000000`, `AdvisoryAutomationAndMeetings1794400000000`, `AdvisorApplications1794500000000`, `AdvisoryPresenceEvents1794600000000`), **0 applied, 4 pending**, no other pending migration, none of the 37 existing migration files changed versus `master`. Production is PostgreSQL 17.6, the role is not a superuser, the connection is the direct port 5432. The only blocker the plan reports is item 6.

### 11. Two-pending-request limit and UI preservation: PASS
At HEAD `2998868`: the 7 limit tests pass (including 8 simultaneous requests and many founders at once). All **46 restored files are byte-identical to production `master`** (0 differ), including `standards.css` and `PageHeader.tsx`; the only non-Advisory frontend files that differ are the 13 documented ones (Next 16.4.3 in `package.json`, local-only scripts, the four Advisory page routes, one stylesheet import in `layout.tsx`, two icons, `WorkspaceGate`, `feature-flags`, `nav-config`). The earlier side-by-side comparison (90 of 90 captures identical on 45 pages at desktop and phone width) is unchanged because no frontend file has changed since.

### 12. Remaining launch blockers
| # | Blocker | Owner action |
| --- | --- | --- |
| B1 | `btree_gist` not installed (item 6) | install it |
| B2 | No verified, restorable backup (item 7) | take the dump; I verify the restore |
| B3 | ~~AWS session expired~~ **done; `APP_URL` decided (www); audit rules relaxed.** The 7 variables and `APP_URL` are set during the release (step 2) | none now |
| B4 | Render not provably stopped (item 2) | confirm Suspended and auto-deploy off |
| B5 | Vercel settings unread (item 5) | confirm the three points |
| B6 | Resend domain status unread (item 8) | confirm Verified |
| B7 | Daily webhook secret not generated; billing unconfirmed (item 9) | generate; confirm billing |
| B8 | A second account for the smoke test; the mailbox `ruwadplatform@gmail.com` (receives "new advisor application" emails) read by someone | register the account; confirm the mailbox |
| B9 | **Daily.co data-residency and data-protection approval** | decision below |
| B10 | The owner's final approval, and the owner merges to `master` | |

**B9, what the decision is about (facts from the code and the account):** Daily is a US provider and the HIPAA add-on is not purchased. Video and audio travel through Daily's servers. Rooms are created **without a region pin** (no `geo` setting in the room properties), so Daily chooses the region. Recording is never enabled, rooms are private, and the meeting screen warns against sharing patient-identifiable information. What Daily receives per participant: the RUWAD user id (an opaque UUID) and the display name, plus the room name and times. Attendance webhooks send only room, session and timing data back. **Needed from the owner (with counsel if required):** an explicit decision that this arrangement is acceptable under Saudi data-protection and residency requirements, or an instruction to change it first (for example region pinning, which is a small code change I can make on request). This is a policy approval that I cannot give or assume.

## What I need from you, in order
1. ~~`aws login --profile ruwad`~~ **Done.** ~~Choose `APP_URL`; relax the audit rules~~ **Done** (www; rules relaxed).
2. Install `btree_gist` (item 6) and tell me (I re-run the migration plan; it should say READY).
3. Take the backup (item 7) and send me the dump's file path (I verify the restore locally).
4. Confirm Render (backend **and** `ruwad-ml` if you want it stopped), Vercel and Resend as described (items 2, 5, 8).
5. Give your decision on B9 (Daily data residency); generate the Daily webhook secret and confirm Daily billing.
6. Then say "go" for the release; nothing production-changing happens before that.
