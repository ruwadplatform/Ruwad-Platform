# Advisory Services: launch execution checklist (Step 8)

Prepared 2026-10-29 for the release candidate (runtime code identical to `2998868`; see `advisory-daily-region-decision.md` section 7 for which commit to deploy: the final documentation-only tip, not `5ae8522`). **Nothing in this document has been executed.** Every stage below needs the owner's explicit approval before it runs. All commands are PowerShell, run from the repository root `...\Mohd Muzzammil Projects\ruwad`, and use only scripts that exist in this repository with the arguments they actually support (checked against the code on 2026-10-29). No secret is ever printed, pasted or committed. **Updated for the Daily.co regional-routing decision: stage 4b and gate G-DAILY below.**

## 1. Verification status (what is independent and what is an owner statement)

| Item | Status | How |
| --- | --- |
| Branch `feature/advisory-services`, HEAD `5ae8522`, tree clean (except the untracked seed script) | **Verified** | git |
| Runtime code unchanged since `2998868` | **Verified** | `git diff --name-only 2998868 HEAD` shows only `docs/` and `backend/scripts/ops/` |
| `origin/master` still `e78d361`; 0 commits not in HEAD; branch not pushed | **Verified** | `git fetch`, `git ls-remote` |
| Lightsail ACTIVE on deployment **10**, image **`api.8`**, 24 variables, RUNNING micro scale 1 | **Verified** | AWS (session valid today) |
| Migration plan: exactly **4 pending**, 0 applied, READY, one transaction | **Verified** | read-only production plan |
| `btree_gist` installed | **Verified** | same plan (also 1.7, schema `extensions`, verified earlier) |
| Baseline snapshot: 66 tables, 1,536 rows, no `advisory_*` table, SHA-256 `4d31baee…11a9` | **Verified** | `docs/evidence/prod-baseline-2026-10-29.json`, tracked in git |
| 46 restored UI files identical to production; 13 documented non-Advisory differences | **Verified** | git |
| Tests today: unit 1,150; Advisory integration **129/129** (cap 7/7, attendance ledger); visibility 19/19; auth e2e 21/21; ops 11/11; frontend 85/85 | **Verified** | local runs |
| Vercel flag absent in the live build (`/discover/advisory-services` is 404) | **Verified from outside** | public GET |
| Render `ruwad-backend` suspended, auto-deploy off | **Owner statement.** Independent evidence is consistent (the URL gives no answer) but is not proof | |
| Vercel production branch `master`, auto-deploy on, flag not configured | **Owner statement** (flag absence also verified from outside) | |
| Resend shows `karama.tech` Verified | **Owner statement** (DNS records exist, which is consistent) | |
| Daily billing and usage alert; second smoke-test account; mailbox monitored | **Owner statements** | |
| **Daily.co data residency: owner decision is REGION (regional routing), investigated and still OPEN** | **Not approved.** An earlier version of this table wrongly showed this as approved. Routing governs only live media; metadata, logs and webhook data stay with Daily's US systems. Needs the owner's choice of region and mechanism and counsel's re-review: see `advisory-daily-region-decision.md`. **Gate G-DAILY blocks stage 6.** | |

## 2. Database recovery status (read this before stage 1)

- **No verified, recoverable backup exists, and none can be shown from here.** The owner deferred the manual dump. Supabase's own backup or point-in-time-recovery status could not be read (no access token; the dashboard is the only place to see it), and the plan's entitlements are unknown.
- **One indirect signal, not a backup:** production reports WAL archiving on (`archive_mode on`, 1,159 segments archived, 0 failures, latest this morning). That suggests Supabase is archiving, but it does not prove a restore point exists, is retained, or that the owner's plan allows using it. Do not treat it as recovery capability.
- **The before/after snapshot is evidence, not a backup.** It records row counts and schema fingerprints so we can prove existing tables were not altered. It cannot restore anything.
- **Consequence of applying the migrations without a recoverable backup:** if the migrations (or anything done by hand during the window) damaged existing data, there would be no verified copy to restore from. Mitigations that exist: the migrations only add new `advisory_*` objects (the only shared object, `btree_gist`, is already installed); they were rehearsed on a production-equivalent copy; they run in one transaction; and the snapshot comparison checks afterwards that every pre-existing table is identical. Residual risk: a mistake made by hand in the database. Nobody should edit the database during the window.
- **Can the procedure stop safely before changing anything if a prerequisite fails? Yes, proven today.** (a) The guard's `plan` blocks before any change if a non-Advisory migration is pending, if the Advisory migrations are partly applied, if Advisory tables already exist unrecorded, if `btree_gist` is missing, or if the migrations table is absent. (b) `apply` additionally refuses without a backup reference, without the exact confirmation phrase for the host, and when everything is already applied. (c) **All-or-nothing, tested on a scratch copy:** I sabotaged migration 4 with a conflicting table and ran the raw migration command, bypassing the guard. Migrations 1 to 3 ran, migration 4 failed, and the whole run rolled back: no Advisory table remained except the sabotage table, **0 migration records**, no enum or index left behind.
- If the owner changes their mind, a dump can still be taken at any time before stage 1 (needs PostgreSQL client tools 17 or newer, not installed here) and I will restore-test it locally.

## 3. Does setting the Lightsail environment first expose Advisory early, or break anything?

Checked against the code production is running now (`origin/master`):

- **None of the 7 new variables is read by current production code** (`ADVISORY_ENABLED`, `ADVISORY_VIDEO_PROVIDER`, `ADVISORY_EMAIL_MODE`, `ADVISORY_SCHEDULER_ENABLED`, `DAILY_API_KEY`, `DAILY_DOMAIN`, `DAILY_WEBHOOK_SECRET`: 0 occurrences). On image `api.8` they are inert strings. The Advisory routes do not exist in that image, so nothing can be exposed.
- **`APP_URL` is the only variable with an effect:** the existing email service builds links from it (admin submission review, NDA, profile, introduction links). After the change those links point at `https://www.ruwad.studio` instead of `https://ruwad-platform.vercel.app`. Both addresses serve the same site, so the links work; this was accepted by the owner. It is the one change to existing behaviour in the whole environment step.
- **No premature exposure after stage 3 either:** once the new image runs with `ADVISORY_ENABLED=true`, the Advisory API is live but the website has no entry point (the Vercel flag is still off), the directory is empty, and nothing can be booked (no advisors exist). The only thing reachable by someone who calls the API directly while signed in is submitting an advisor application, which only creates a pending application and one notification email to `ruwadplatform@gmail.com`.
- **Why migrations must come first:** if the new image started with Advisory enabled before the tables existed, the Advisory API and the scheduler would error. Stage 1 therefore comes first and stage 3 requires its gate.
- **Existing features:** the environment step copies all 24 existing variables verbatim (23 unrelated ones compared by value hash: identical, none removed). It deploys the same image, so the only operational effect is a rolling restart. The workflow's later image deployment copies the then-current environment, so the new settings survive the merge.

## 4. Order of execution

0 baseline and secrets, 1 migrations, 2 environment, 3 merge and backend deploy, 4 backend and endpoint verification, **4b Daily region (domain `geo`, before any room exists)**, 5 Daily webhook, **gate G-DAILY**, 6 Vercel activation, 7 live smoke test, 8 watch. **The frontend is last, behind a verified backend, webhook and the Daily region decision.** Expected elapsed time about 30 to 45 minutes; backend live to feature public about 5 to 10 minutes.

## 5. Stage by stage

Shell setup for the whole window (one PowerShell, repository root):

```powershell
cd "C:\Users\muzza\Desktop\Mohd Muzzammil\Mohd Muzzammil Projects\ruwad"
aws login --profile ruwad        # the session lasts only a few hours; log in right before the window
# production connection string into THIS shell only, from the existing backend\.env, never printed:
$env:DATABASE_URL = ((Select-String -Path backend\.env -Pattern '^\s*DATABASE_URL\s*=').Line -replace '^\s*DATABASE_URL\s*=\s*','').Trim().Trim('"').Trim("'")
```

### Stage 0: fresh baseline and the two secret files (approval required)

- **Preconditions:** the owner has said "start"; `aws sts get-caller-identity --profile ruwad --region ap-southeast-2` succeeds.
- **Actions:**
  ```powershell
  node backend/scripts/ops/prod-snapshot.js take docs\evidence\prod-prewindow-YYYYMMDD-HHMM.json
  New-Item -ItemType Directory "$HOME\secure" -Force | Out-Null
  node backend/scripts/ops/daily-webhook-production.js gen-secret "$HOME\secure\daily-webhook-secret.txt"
  ((Select-String -Path backend\.env -Pattern '^\s*DAILY_API_KEY\s*=').Line -replace '^\s*DAILY_API_KEY\s*=\s*','').Trim().Trim('"').Trim("'") | Set-Content -NoNewline "$HOME\secure\daily-api-key.txt"
  ```
- **Expected:** `snapshot written: 66 tables, ~1,5xx rows ... latest AddAiSummaryWebSources1794200000000`; `wrote a new 32-byte secret ... (not shown)`. The snapshot refuses to overwrite an existing file; `gen-secret` refuses to overwrite an existing secret.
- **Verify:** both files exist; the owner stores the webhook secret in the password manager (it is needed again if the webhook is ever re-registered).
- **Stop if:** the snapshot reports other than 66 tables or any `advisory_*` table, or a migration newer than `AddAiSummaryWebSources1794200000000` (someone else changed the database).
- **Rollback:** none needed (no production effect). Delete the two files if the release is cancelled.

### Stage 1: migrations (approval required)

- **Preconditions:** stage 0 done; **no one edits the database during the window**; the owner has accepted the no-backup risk.
- **Actions:**
  ```powershell
  node backend/scripts/ops/advisory-migrate.js plan                          # must say READY, 4 pending, btree_gist installed
  $h = ((node backend/scripts/ops/advisory-migrate.js plan | Select-String '^target: (\S+):\d+').Matches[0].Groups[1].Value)
  $env:BACKUP_REFERENCE = "NO-BACKUP-OWNER-ACCEPTED-RISK-YYYY-MM-DD"        # honest: the guard records this text; it is not a backup
  $env:ADVISORY_MIGRATION_CONFIRM = "APPLY-ADVISORY-MIGRATIONS-TO $h"
  node backend/scripts/ops/advisory-migrate.js apply
  Remove-Item Env:BACKUP_REFERENCE, Env:ADVISORY_MIGRATION_CONFIRM
  node backend/scripts/ops/prod-snapshot.js compare docs\evidence\prod-prewindow-YYYYMMDD-HHMM.json
  ```
- **Expected:** `executed: CreateAdvisoryServices..., AdvisoryAutomationAndMeetings..., AdvisorApplications..., AdvisoryPresenceEvents...`; `verification: migrations recorded 4/4; Advisory tables present 11/11`; `DONE`; then `EXISTING SCHEMA UNCHANGED: every pre-existing table has the identical schema; only advisory_* tables were added.` Row-count differences in existing tables are informational (the live site keeps writing); `migrations 37 -> 41` is expected.
- **Verify:** also open `https://www.ruwad.studio/dashboard` and `<backend>/api/health` (200): the running old code does not use the new tables.
- **Stop if:** `plan` says BLOCKED; `apply` exits non-zero (nothing was applied: one transaction; confirm with `plan`); `compare` prints PROBLEM or lists any changed or missing existing table. **Never run `apply` again after `DONE`.**
- **Rollback:** a failure applies nothing. After success, leave the additive tables in place (the old code ignores them). Reverting is the last resort and destroys Advisory data (runbook 11, level 5).
- **Approval:** required.

### Stage 2: Lightsail environment (approval required)

- **Preconditions:** stage 1 gate passed; Lightsail still ACTIVE version 10 (the wrapper refuses otherwise); the two secret files exist.
- **Actions:**
  ```powershell
  node backend/scripts/ops/lightsail-advisory-env.js plan
  $env:LIGHTSAIL_ENV_CONFIRM = "SET-ADVISORY-ENV ruwad-backend FROM-VERSION-10"
  node backend/scripts/ops/lightsail-advisory-env.js apply
  Remove-Item Env:LIGHTSAIL_ENV_CONFIRM
  ```
  (It reads the key and secret from `~\secure\daily-api-key.txt` and `~\secure\daily-webhook-secret.txt`, or from `DAILY_API_KEY` / `DAILY_WEBHOOK_SECRET` if set; options: `--profile ruwad`, `EXPECT_DEPLOYMENT_VERSION`.)
- **Expected from `plan`:** `Daily key accepted for domain ruwadstudio.` / `Lightsail current deployment: version 10 (ACTIVE), image :ruwad-backend.api.8` / `Changes: ADVISORY_ENABLED added, ADVISORY_VIDEO_PROVIDER added, DAILY_DOMAIN added, ADVISORY_EMAIL_MODE added, ADVISORY_SCHEDULER_ENABLED added, APP_URL updated, DAILY_API_KEY added, DAILY_WEBHOOK_SECRET added` (exactly 7 added and 1 updated, nothing else) / `PLAN ONLY`. **If the list differs in any way, stop.**
- **Expected from `apply`:** `Created deployment version 11`, polling until ACTIVE, `health after the change: HTTP 200`, the audit printing `READY`, then `DONE`.
- **Verify:** `node backend/scripts/ops/lightsail-env-audit.js` says READY; `/api/health` 200; `GET <backend>/api/advisory/advisors` still **404** (old image).
- **Stop if:** version is not 10 or not ACTIVE; the change list differs; the deployment FAILS or does not become ACTIVE within 10 minutes (Lightsail keeps serving version 10).
- **Rollback:** `lightsail-rollback.js plan 10`, then (below) `apply 10`; or `set-lightsail-env.js --unset ...` for a partial switch-off. Approval required.

### Stage 3: merge to `master` and backend deploy (approval required; the owner performs it)

- **Preconditions:** stages 1 and 2 passed; `git fetch origin` shows `origin/master` still `e78d361`; the candidate is the **final documentation-only tip** of the branch, called `<tip>` below (see `advisory-daily-region-decision.md` section 7: `5ae8522` and `d90a5b1` have identical runtime code; the tip adds only documents). Before pushing, prove it: `git diff --name-only 2998868 <tip> | Select-String -NotMatch '^(docs/|backend/scripts/ops/)'` must print nothing.
- **How the deploy is triggered (read from `.github/workflows/deploy-backend-lightsail.yml`):** it runs **only on a push to `master`** that touches `backend/**`, `package*.json`, `infra/aws/**` or the workflow, plus manual `workflow_dispatch`. AWS access is a short-lived OIDC token valid only for `master`. It builds the image, deploys it by copying the current deployment's environment and swapping only the image, and waits for ACTIVE and `/api/health`. There is no other GitHub CI in this repository, so a pull request has no test checks: the local test results above are the evidence.
- **Actions (preferred: exact commits, local `master` untouched):**
  ```powershell
  git fetch origin
  git rev-parse --short origin/master        # must print e78d361
  git push -u origin feature/advisory-services     # publishes the branch; deploys nothing (workflow is master-only); Vercel may build a preview
  git push origin <tip>:refs/heads/master         # fast-forwards master to the verified commit; triggers the Lightsail workflow AND the Vercel production build
  ```
  If branch protection refuses the direct push, open a pull request from `feature/advisory-services` and merge it with **Create a merge commit** (the result has the identical tree because `master` has no newer commits). Do not use squash or rebase (they rewrite the verified commits). The local `master` branch is stale and must not be used.
- **Expected:** one workflow run; the Lightsail deployment list shows a new version (12) ACTIVE with an image newer than `api.8`; Vercel builds the commit with the Advisory flag **still unset**, so the site looks exactly as today.
- **Verify:** `aws lightsail get-container-service-deployments --service-name ruwad-backend --profile ruwad --region ap-southeast-2 --query "deployments[0].[version,state]" --output text` prints `12 ACTIVE`; then stage 4.
- **Stop if:** the workflow fails (Lightsail keeps the previous deployment; nothing public changed); the deployment does not become ACTIVE; stage 4 fails.
- **Rollback:** `lightsail-rollback.js apply 11` (old code, Advisory settings kept) or `apply 10` (old code, original environment). If the Vercel build misbehaves: promote the previous production deployment (Vercel dashboard).
- **Approval:** required (the owner pushes or merges).

### Stage 4: verify the backend and the webhook endpoint (no change)

- **Actions:**
  ```powershell
  $B = "https://ruwad-backend.vaykv052p845y.ap-southeast-2.cs.amazonlightsail.com"
  curl.exe -s -o NUL -w "health %{http_code}`n" "$B/api/health"
  curl.exe -s -w "`n advisors %{http_code}`n" "$B/api/advisory/advisors"
  curl.exe -s -o NUL -w "admin (signed out) %{http_code}`n" "$B/api/advisory/admin/stats"
  curl.exe -s -o NUL -w "startups %{http_code}`n" "$B/api/startups?limit=1"
  $env:DAILY_API_KEY = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
  node backend/scripts/ops/daily-webhook-production.js probe
  ```
- **Expected:** `health 200`; `[]` and `advisors 200`; `admin 401`; `startups 200`; probe prints `HTTP 401 -> READY (signatures are enforced)`.
- **Stop if:** advisors is 404 (Advisory off or old image), the probe prints 404 (flag or secret missing) or anything else, or any existing endpoint fails.
- **Rollback:** as stage 3. **Approval:** the probe sends one unsigned POST to production (it changes nothing); include it in the approval for stage 5.

### Stage 4b: Daily region (approval required; a Daily account setting, not a Lightsail or Vercel change)

- **Preconditions:** the owner has chosen the region and mechanism (recommendation: domain `geo = "eu-central-1"`, Frankfurt, option A in `advisory-daily-region-decision.md`); **0 rooms exist** on the Daily account (`daily-webhook-production.js list` shows `rooms: 0`).
- **Action (documented Daily request, using the production key from `~\secure\daily-api-key.txt`; no repository script exists for this, so it is a one-off):**
  ```powershell
  $k = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
  Invoke-RestMethod -Method Post -Uri "https://api.daily.co/v1/" -Headers @{ Authorization = "Bearer $k" } -ContentType "application/json" -Body '{"properties":{"geo":"eu-central-1"}}' | Out-Null
  (Invoke-RestMethod -Uri "https://api.daily.co/v1/" -Headers @{ Authorization = "Bearer $k" }).config.geo      # must print eu-central-1
  Remove-Variable k
  ```
  (The Daily dashboard's domain settings do the same.)
- **Expected:** the read-back prints `eu-central-1`; nothing else changes.
- **Verify later:** during the smoke test, check the session's region in Daily's dashboard; I have not verified whether a room read-back shows an inherited domain `geo`.
- **Stop if:** Daily rejects the property or the read-back differs; do not continue to stage 6 without a confirmed region.
- **Rollback:** set `geo` back to null through the dashboard or the same request with `null` (how to unset is not documented: try it in the window). No room or data exists to lose.

### Gate G-DAILY (before stage 6, no change)

All three must be true: (1) the owner has chosen the region and mechanism; (2) counsel has re-reviewed the arrangement knowing that routing covers **live media only** and that names, ids and IP addresses reach Daily's US-hosted systems regardless (and has confirmed the PDPL position, which routing alone does not settle); (3) stage 4b is done and read back. If any is missing, **do not add the Vercel flag**: the backend can stay live with no visible entry point, and no meeting can be created.

### Stage 5: register the Daily webhook (approval required)

- **Preconditions:** the probe says READY; `daily-webhook-production.js list` shows 0 webhooks.
- **Actions:**
  ```powershell
  $env:DAILY_API_KEY = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
  $env:DAILY_WEBHOOK_SECRET = (Get-Content "$HOME\secure\daily-webhook-secret.txt" -Raw).Trim()
  $env:DAILY_WEBHOOK_CONFIRM = "REGISTER ruwad-backend.vaykv052p845y.ap-southeast-2.cs.amazonlightsail.com"
  node backend/scripts/ops/daily-webhook-production.js register
  node backend/scripts/ops/daily-webhook-production.js list
  Remove-Item Env:DAILY_API_KEY, Env:DAILY_WEBHOOK_SECRET, Env:DAILY_WEBHOOK_CONFIRM
  ```
- **Expected:** `registered: <uuid> ... state=ACTIVE events=participant.joined,participant.left retry=exponential`, `OK: the webhook is ACTIVE.`, and `list` shows exactly one webhook. Note the printed rollback line and the uuid.
- **Stop if:** Daily refuses (message names the cause, often billing or an unready endpoint); the state is not ACTIVE; more than one webhook points at the URL.
- **Rollback:** `$env:DAILY_WEBHOOK_CONFIRM = "DELETE <uuid>"; node backend/scripts/ops/daily-webhook-production.js delete <uuid>`. Without a webhook, consultations still work; attendance falls back to the Needs Review queue.

### Stage 6: Vercel activation (approval required; the owner uses the dashboard)

- **Preconditions:** stages 4 and 5 passed; the Vercel build from stage 3 is Ready.
- **Actions:** Vercel, project, Settings, Environment Variables: add `NEXT_PUBLIC_ADVISORY_ENABLED` = `true`, scope **Production only**. Then Deployments: open the latest Production deployment, **Redeploy**, with "use existing build cache" **off** (the value is inlined at build time, so only a new build carries it). Note the previous production deployment first: it is the instant-rollback target.
- **Expected:** the new deployment becomes Ready and Current.
- **Verify:** `curl.exe -s -o NUL -w "%{http_code}`n" https://www.ruwad.studio/discover/advisory-services` returns 200 and lists no advisors yet; the Discover menu shows Advisory Services; `/dashboard`, `/startups`, `/investors` load as before.
- **Stop if:** the build fails (the previous deployment keeps serving: the feature is simply not visible, which is harmless) or an existing page changed.
- **Rollback:** remove the variable and redeploy, or promote the previous production deployment (instant).

### Stage 7: controlled live smoke test (approval required; creates real records and sends real emails)

Follow runbook section 8 with the administrator account (A) and the second account (B): B applies, A approves, B sets hours and a service, A books the earliest slot, optional limit check (a third pending request is refused), B approves, both join and one rejoins, both leave, check attendance, B concludes, then decide to keep B as the first real advisor or **Suspend** B. Emails go to the two owner mailboxes and `ruwadplatform@gmail.com`.
- **Stop if:** any expected email does not arrive, the room does not open, attendance is not recorded within a minute, or any error appears in the Lightsail logs. **Rollback:** Vercel level first (hide the feature), then the rest; data is kept.

### Stage 8: watch for 24 hours

Lightsail logs (5xx, email failures), Vercel errors, the Daily webhook state (must stay ACTIVE), Resend delivery, the Needs Review queue, incoming applications. The scheduler runs every 60 seconds.

## 6. Rollback commands (reverse order)

```powershell
# stage 6: Vercel dashboard: remove NEXT_PUBLIC_ADVISORY_ENABLED and redeploy, or promote the previous production deployment
# stage 5: remove the webhook
$env:DAILY_API_KEY = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
$env:DAILY_WEBHOOK_CONFIRM = "DELETE <uuid>"; node backend/scripts/ops/daily-webhook-production.js delete <uuid>
# stages 3 and 2: look first, then act (use the real current and target version numbers shown by plan)
node backend/scripts/ops/lightsail-rollback.js plan 11        # old code, Advisory settings kept (after stage 3)
node backend/scripts/ops/lightsail-rollback.js plan 10        # old code, original environment incl. APP_URL (after stage 2 or 3)
$env:LIGHTSAIL_ROLLBACK_CONFIRM = "ROLLBACK-LIGHTSAIL ruwad-backend TO-VERSION-10"
node backend/scripts/ops/lightsail-rollback.js apply 10
# stage 1: normally leave the additive tables; reverting drops their data and there is no backup (runbook section 11, level 5)
```

`lightsail-rollback.js` arguments: `plan|apply <version> [--profile ruwad]`; it refuses placeholder (nginx) versions and rolls forward as a new deployment copying the target's exact image, environment, ports and health check.

## 7. Remaining technical risks

0. **Daily.co data residency / PDPL: OPEN (owner decision REGION).** A launch blocker until gate G-DAILY is satisfied. Separate from, and not a substitute for, the no-backup risk below.
1. **No recoverable backup (accepted).** The only unmitigated risk in the release.
2. Daily webhook delivery has never been exercised against production (protocol proven locally in Step 4); billing and the endpoint are owner-confirmed only.
3. Live email through Resend has never been exercised from this branch; the smoke test is its first real run.
4. AWS login expires within hours (log in right before the window); one `micro` instance (brief connection resets during each Lightsail swap: stages 2 and 3).
5. Local tests ran on PostgreSQL 18.4, production is 17.6 (migrations use no version-specific features and were rehearsed; the guard re-checks).
6. Render and Vercel states are owner statements; Vercel auto-build on the `master` push is assumed (confirmed by the owner).

## 8. Recommendation

**GO for stages 0 to 5, NO-GO for stage 6 (public activation) until gate G-DAILY is satisfied**, and in all cases conditional on the owner's explicit approval of each stage and acceptance of the **separately documented** no-backup risk (section 2). Everything that can be verified from here is verified; the owner confirmations are recorded as owner statements, not as independent checks. The earlier line that showed Daily data residency as approved was wrong and has been corrected.
