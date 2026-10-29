# Advisory Services: launch execution checklist (Step 8)

Prepared 2026-10-29, updated after the owner approved Frankfurt (`eu-central-1`, domain level) as a technical choice. **Nothing in this document has been executed.** Every step needs the owner's separate, explicit authorisation. The intended release tip is the **latest local documentation commit** on `feature/advisory-services` (`git rev-parse --short HEAD`), valid only while runtime code is identical to the tested candidate `2998868` (proof command in step 5). All commands are PowerShell from the repository root `...\Mohd Muzzammil Projects\ruwad` and use only scripts that exist here, with the arguments they support. No secret is printed, pasted or committed, and none is created before step 4.

## 1. Verification status (what is independent and what is an owner statement)

| Item | Status | How |
| --- | --- |
| Branch `feature/advisory-services`; tree clean apart from the untracked seed script and the files of the current documentation commit; branch not pushed | **Verified** | git |
| Runtime code unchanged since `2998868` | **Verified** | `git diff --name-only 2998868 HEAD` shows only `docs/` and `backend/scripts/ops/` |
| `origin/master` still `e78d361`; 0 commits not in HEAD; branch not pushed | **Verified** | `git fetch`, `git ls-remote` |
| Lightsail ACTIVE on deployment **10**, image **`api.8`**, 24 variables, RUNNING micro scale 1 | **Verified** | AWS (session valid today) |
| Migration plan: exactly **4 pending**, 0 applied, READY, one transaction | **Verified** | read-only production plan |
| `btree_gist` installed | **Verified** | same plan (also 1.7, schema `extensions`, verified earlier) |
| Baseline snapshot: 66 tables, 1,536 rows, no `advisory_*` table, SHA-256 `4d31baee…11a9` | **Verified** | `docs/evidence/prod-baseline-2026-10-29.json`, tracked in git |
| 46 restored UI files identical to production; 13 documented non-Advisory differences | **Verified** | git |
| Tests (run 2026-10-29 on this runtime code; **not repeated**, because runtime is unchanged): unit 1,150; Advisory integration **129/129** (cap 7/7, attendance ledger); visibility 19/19; auth e2e 21/21; frontend 85/85. Ops tests (tooling) re-run: **12/12** | **Verified** | local runs |
| Vercel flag absent in the live build (`/discover/advisory-services` is 404) | **Verified from outside** | public GET |
| Render `ruwad-backend` suspended, auto-deploy disabled | **Owner statement** (the URL gives no answer, which is consistent, not proof) | |
| Vercel production branch `master`, auto-deploy enabled, `NEXT_PUBLIC_ADVISORY_ENABLED` not configured | **Owner statement** (flag absence also verified from outside: `/discover/advisory-services` is 404) | |
| Resend shows `karama.tech` Verified | **Owner statement** (DNS records exist, which is consistent) | |
| Daily.co billing and usage alert configured; second smoke-test account ready; `ruwadplatform@gmail.com` monitored | **Owner statements** | |
| **Daily.co media region: Frankfurt `eu-central-1`, domain-level `geo` (technical choice approved by the owner)** | **Approved as a technical configuration only; NOT applied; NOT approval of international personal-data processing; NOT a PDPL finding.** Live domain config verified read-only: `geo` null, recording and transcription disabled, 0 rooms, 0 webhooks; original saved as `docs/evidence/daily-domain-config-before-2026-10-29.json`. Procedure, rollback and limitations: `advisory-daily-frankfurt-config.md`. | |
| **Responsible team's review of Daily's cross-border processing and Saudi PDPL** | **Owner decision REGION; the earlier "approved" entry was withdrawn.** Still to be confirmed by the responsible team: step 9 blocks public activation. | |

## 2. Database recovery status (read this before step 3)

- **No verified, recoverable backup exists, and none can be shown from here.** The owner deferred the manual dump. Supabase's own backup or point-in-time-recovery status could not be read (no access token; the dashboard is the only place to see it), and the plan's entitlements are unknown.
- **One indirect signal, not a backup:** production reports WAL archiving on (`archive_mode on`, 1,159 segments archived, 0 failures, latest this morning). That suggests Supabase is archiving, but it does not prove a restore point exists, is retained, or that the owner's plan allows using it. Do not treat it as recovery capability.
- **The before/after snapshot is evidence, not a backup.** It records row counts and schema fingerprints so we can prove existing tables were not altered. It cannot restore anything.
- **Consequence of applying the migrations without a recoverable backup:** if the migrations (or anything done by hand during the window) damaged existing data, there would be no verified copy to restore from. Mitigations that exist: the migrations only add new `advisory_*` objects (the only shared object, `btree_gist`, is already installed); they were rehearsed on a production-equivalent copy; they run in one transaction; and the snapshot comparison checks afterwards that every pre-existing table is identical. Residual risk: a mistake made by hand in the database. Nobody should edit the database during the window.
- **Can the procedure stop safely before changing anything if a prerequisite fails? Yes, proven today.** (a) The guard's `plan` blocks before any change if a non-Advisory migration is pending, if the Advisory migrations are partly applied, if Advisory tables already exist unrecorded, if `btree_gist` is missing, or if the migrations table is absent. (b) `apply` additionally refuses without a backup reference, without the exact confirmation phrase for the host, and when everything is already applied. (c) **All-or-nothing, tested on a scratch copy:** I sabotaged migration 4 with a conflicting table and ran the raw migration command, bypassing the guard. Migrations 1 to 3 ran, migration 4 failed, and the whole run rolled back: no Advisory table remained except the sabotage table, **0 migration records**, no enum or index left behind.
- If the owner changes their mind, a dump can still be taken at any time before step 3 (needs PostgreSQL client tools 17 or newer, not installed here) and I will restore-test it locally.

## 3. Does setting the Lightsail environment first expose Advisory early, or break anything?

Checked against the code production is running now (`origin/master`):

- **None of the 7 new variables is read by current production code** (`ADVISORY_ENABLED`, `ADVISORY_VIDEO_PROVIDER`, `ADVISORY_EMAIL_MODE`, `ADVISORY_SCHEDULER_ENABLED`, `DAILY_API_KEY`, `DAILY_DOMAIN`, `DAILY_WEBHOOK_SECRET`: 0 occurrences). On image `api.8` they are inert strings. The Advisory routes do not exist in that image, so nothing can be exposed.
- **`APP_URL` is the only variable with an effect:** the existing email service builds links from it (admin submission review, NDA, profile, introduction links). After the change those links point at `https://www.ruwad.studio` instead of `https://ruwad-platform.vercel.app`. Both addresses serve the same site, so the links work; this was accepted by the owner. It is the one change to existing behaviour in the whole environment step.
- **No premature exposure after step 5 either:** once the new image runs with `ADVISORY_ENABLED=true`, the Advisory API is live but the website has no entry point (the Vercel flag is still off), the directory is empty, and nothing can be booked (no advisors exist). The only thing reachable by someone who calls the API directly while signed in is submitting an advisor application, which only creates a pending application and one notification email to `ruwadplatform@gmail.com`.
- **Why migrations must come first:** if the new image started with Advisory enabled before the tables existed, the Advisory API and the scheduler would error. The migrations (step 3) therefore come before the environment (step 4) and the code (step 5), and step 5 requires step 3's gate.
- **Existing features:** the environment step copies all 24 existing variables verbatim (23 unrelated ones compared by value hash: identical, none removed). It deploys the same image, so the only operational effect is a rolling restart. The workflow's later image deployment copies the then-current environment, so the new settings survive the merge.

## 4. Execution order, per-step recommendation, and what is needed

Twelve steps, in this order. **Each production-changing step (3, 4, 5, 7, 8, 10, 11) needs its own explicit authorisation; step 9 is a confirmation by the responsible team.** The frontend (step 10) is last and is gated by steps 6, 7, 8 and 9. Expected elapsed time about 40 to 60 minutes; backend live to feature public about 10 to 15 minutes.

| Step | Action | Authorisation | Recommendation now |
| --- | --- | --- | --- |
| 1 | Renew AWS login; fresh read-only baseline | owner says "start" | **GO** |
| 2 | Recheck the migration plan (read-only) | with step 1 | **GO** |
| 3 | Apply the four Advisory migrations | **separate approval** | **GO** (no-backup risk accepted; recorded below) |
| 4 | Create the two secret files; apply the Lightsail environment update | **separate approval** | **GO** |
| 5 | Push the release tip to `master` (backend deploys; Vercel builds, flag still off) | **separate approval; the owner pushes** | **GO** |
| 6 | Verify the backend and the webhook endpoint (read-only) | with step 5 | **GO** |
| 7 | Register the Daily.co production webhook | **separate approval** | **GO** (after step 6 passes) |
| 8 | Set and verify Frankfurt `geo` | **separate approval** | **GO** (before any room exists) |
| 9 | Responsible team confirms review of Daily's cross-border processing and Saudi PDPL | owner / responsible team | **NO-GO until recorded** |
| 10 | Add `NEXT_PUBLIC_ADVISORY_ENABLED=true` in Vercel and redeploy | **separate approval** | **NO-GO until step 9 is recorded** (technically ready) |
| 11 | Controlled live smoke test | **separate approval** | follows step 10 |
| 12 | Monitor for 24 hours | n/a | follows step 11 |

## 5. Step by step

Shell setup for the window (one PowerShell, repository root). Nothing here changes production:

```powershell
cd "C:\Users\muzza\Desktop\Mohd Muzzammil\Mohd Muzzammil Projects\ruwad"
```

### Step 1: renew AWS and take a fresh baseline (read-only)

- **Preconditions:** the owner says "start". **Action:** `aws login --profile ruwad`, then
  ```powershell
  aws sts get-caller-identity --profile ruwad --region ap-southeast-2
  $env:DATABASE_URL = ((Select-String -Path backend\.env -Pattern '^\s*DATABASE_URL\s*=').Line -replace '^\s*DATABASE_URL\s*=\s*','').Trim().Trim('"').Trim("'")
  node backend/scripts/ops/prod-snapshot.js take docs\evidence\prod-prewindow-YYYYMMDD-HHMM.json
  ```
- **Expected:** a valid identity; `snapshot written: 66 tables, ~1,5xx rows ... latest AddAiSummaryWebSources1794200000000` (the tool refuses to overwrite). **Verify** against `docs/evidence/prod-baseline-2026-10-29.json` (66 tables, no `advisory_*` table).
- **Stop if:** other than 66 tables, any `advisory_*` table, or a migration newer than `AddAiSummaryWebSources1794200000000` (someone changed the database). **Rollback:** none (read-only). **Note:** the snapshot is evidence, not a backup.

### Step 2: recheck the migration plan (read-only)

- **Action:** `node backend/scripts/ops/advisory-migrate.js plan`. **Expected:** `btree_gist: installed`, `already applied: 0 pending: 4`, `READY: would apply 4 migration(s) in ONE transaction`, listing `CreateAdvisoryServices1794300000000`, `AdvisoryAutomationAndMeetings1794400000000`, `AdvisorApplications1794500000000`, `AdvisoryPresenceEvents1794600000000`.
- **Stop if:** BLOCKED, or any other count. **Rollback:** none.

### Step 3: apply the four Advisory migrations (separate authorisation)

- **Preconditions:** steps 1 and 2 passed; nobody edits the database during the window; the owner has accepted the no-backup risk (section 2).
- **Action:**
  ```powershell
  $h = ((node backend/scripts/ops/advisory-migrate.js plan | Select-String '^target: (\S+):\d+').Matches[0].Groups[1].Value)
  $env:BACKUP_REFERENCE = "NO-BACKUP-OWNER-ACCEPTED-RISK-YYYY-MM-DD"     # honest text; the guard records it; it is NOT a backup
  $env:ADVISORY_MIGRATION_CONFIRM = "APPLY-ADVISORY-MIGRATIONS-TO $h"
  node backend/scripts/ops/advisory-migrate.js apply
  Remove-Item Env:BACKUP_REFERENCE, Env:ADVISORY_MIGRATION_CONFIRM
  node backend/scripts/ops/prod-snapshot.js compare docs\evidence\prod-prewindow-YYYYMMDD-HHMM.json
  ```
- **Expected:** `verification: migrations recorded 4/4; Advisory tables present 11/11`, `DONE`; then `EXISTING SCHEMA UNCHANGED` (`migrations 37 -> 41` and small row-count drift are normal). **Verify:** `https://www.ruwad.studio/dashboard` and `<backend>/api/health` still 200 (the running old code ignores the new tables).
- **Stop if:** `apply` exits non-zero (nothing applied: one transaction; confirm with `plan`), or `compare` prints PROBLEM. **Never run `apply` again after DONE.**
- **Rollback:** a failure applies nothing. After success, leave the additive tables (the old code ignores them); reverting is a last resort and destroys Advisory data with no backup (runbook section 11, level 5).

### Step 4: secret files, then the Lightsail environment update (separate authorisation)

- **Preconditions:** step 3 passed; Lightsail still ACTIVE version 10 (the wrapper refuses otherwise). **Secrets are created only now, with this approval:**
  ```powershell
  New-Item -ItemType Directory "$HOME\secure" -Force | Out-Null
  node backend/scripts/ops/daily-webhook-production.js gen-secret "$HOME\secure\daily-webhook-secret.txt"
  ((Select-String -Path backend\.env -Pattern '^\s*DAILY_API_KEY\s*=').Line -replace '^\s*DAILY_API_KEY\s*=\s*','').Trim().Trim('"').Trim("'") | Set-Content -NoNewline "$HOME\secure\daily-api-key.txt"
  ```
  The owner stores the webhook secret in the password manager (needed again if the webhook is re-registered).
- **Action:**
  ```powershell
  node backend/scripts/ops/lightsail-advisory-env.js plan
  $env:LIGHTSAIL_ENV_CONFIRM = "SET-ADVISORY-ENV ruwad-backend FROM-VERSION-10"
  node backend/scripts/ops/lightsail-advisory-env.js apply
  Remove-Item Env:LIGHTSAIL_ENV_CONFIRM
  ```
- **Expected from `plan` (stop if it differs in any way):** `Daily key accepted for domain ruwadstudio.` / `version 10 (ACTIVE), image :ruwad-backend.api.8` / `Changes: ADVISORY_ENABLED added, ADVISORY_VIDEO_PROVIDER added, DAILY_DOMAIN added, ADVISORY_EMAIL_MODE added, ADVISORY_SCHEDULER_ENABLED added, APP_URL updated, DAILY_API_KEY added, DAILY_WEBHOOK_SECRET added` (7 added, 1 updated, nothing else). **From `apply`:** `Created deployment version 11`, ACTIVE, `health ... HTTP 200`, audit `READY`, `DONE`.
- **Preservation (verified today, value hashes, names only):** 23 of 23 unrelated variables identical, none removed, 24 to 31 variables; **`FRONTEND_URL`, `GOOGLE_REDIRECT_URI`, `PUBLIC_API_URL` and `DATABASE_URL` untouched.** The helper rebuilds the container from image, environment and ports only; the current deployment has nothing else (`command` empty, one container), so nothing is dropped. None of the 7 new variables is read by the code running now, so they are inert on image `api.8`; only `APP_URL` changes existing behaviour (links in existing emails, accepted).
- **Verify:** `node backend/scripts/ops/lightsail-env-audit.js` says READY; `<backend>/api/advisory/advisors` still 404 (old image). **Stop if:** version not 10/ACTIVE, the change list differs, or the deployment fails or is not ACTIVE within 10 minutes (Lightsail keeps serving version 10).
- **Rollback:** `lightsail-rollback.js plan 10`, then `apply 10` (below). Also delete the two secret files if the release is cancelled.

### Step 5: push the release tip to `master` (separate authorisation; the owner pushes)

- **Preconditions:** steps 3 and 4 passed; `git fetch origin` shows `origin/master` still `e78d361`.
- **How the deploy is triggered (read from `.github/workflows/deploy-backend-lightsail.yml`):** only a push to `master` touching `backend/**`, `package*.json`, `infra/aws/**` or the workflow (and manual `workflow_dispatch`); AWS access is a short-lived OIDC token valid only for `master`; it copies the current environment and swaps only the image. There is no other GitHub CI, so a pull request has no test checks: the local results are the evidence.
- **Prove the tip is only documentation on top of the tested runtime, then push (local `master` is stale and is never used):**
  ```powershell
  $tip = git rev-parse --short HEAD
  git diff --name-only 2998868 $tip | Select-String -NotMatch '^(docs/|backend/scripts/ops/)'     # must print NOTHING
  git rev-parse --short origin/master                                                              # must print e78d361
  git push -u origin feature/advisory-services          # publishes the branch; deploys nothing (workflow is master-only); Vercel may build a preview
  git push origin "$($tip):refs/heads/master"            # fast-forward; triggers the Lightsail workflow AND the Vercel production build
  ```
  If branch protection refuses the direct push, open a pull request and merge with **Create a merge commit** (identical tree). Never squash or rebase.
- **Expected:** one workflow run; a new Lightsail version (12) ACTIVE on a newer image than `api.8`; Vercel builds with the flag still unset, so the website looks exactly as today. **Verify:** `aws lightsail get-container-service-deployments --service-name ruwad-backend --profile ruwad --region ap-southeast-2 --query "deployments[0].[version,state]" --output text` prints `12 ACTIVE`.
- **Stop if:** the workflow fails (Lightsail keeps the previous deployment), the deployment is not ACTIVE, or step 6 fails.
- **Rollback:** `lightsail-rollback.js apply 11` (old code, Advisory settings kept) or `apply 10` (old code, original environment). If the Vercel build misbehaves, promote the previous production deployment.

### Step 6: verify the backend and the webhook endpoint (read-only)

```powershell
$B = "https://ruwad-backend.vaykv052p845y.ap-southeast-2.cs.amazonlightsail.com"
curl.exe -s -o NUL -w "health %{http_code}`n" "$B/api/health"
curl.exe -s -w "`n advisors %{http_code}`n" "$B/api/advisory/advisors"
curl.exe -s -o NUL -w "admin (signed out) %{http_code}`n" "$B/api/advisory/admin/stats"
curl.exe -s -o NUL -w "startups %{http_code}`n" "$B/api/startups?limit=1"
$env:DAILY_API_KEY = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
node backend/scripts/ops/daily-webhook-production.js probe
```
- **Expected:** `health 200`; `[]` then `advisors 200`; `admin 401`; `startups 200`; the probe prints `HTTP 401 -> READY (signatures are enforced)`. **Stop if:** advisors is 404 (Advisory off or old image), the probe prints 404 (flag or secret missing) or anything else, or an existing endpoint fails. **Rollback:** as step 5. (The probe sends one unsigned request that changes nothing; it is covered by the step 7 authorisation.)

### Step 7: register the Daily.co production webhook (separate authorisation)

- **Preconditions:** step 6 passed; `daily-webhook-production.js list` shows 0 webhooks (the domain allows exactly 1: `max_webhook_count 1`).
- **Action:**
  ```powershell
  $env:DAILY_API_KEY = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
  $env:DAILY_WEBHOOK_SECRET = (Get-Content "$HOME\secure\daily-webhook-secret.txt" -Raw).Trim()
  $env:DAILY_WEBHOOK_CONFIRM = "REGISTER ruwad-backend.vaykv052p845y.ap-southeast-2.cs.amazonlightsail.com"
  node backend/scripts/ops/daily-webhook-production.js register
  node backend/scripts/ops/daily-webhook-production.js list
  Remove-Item Env:DAILY_API_KEY, Env:DAILY_WEBHOOK_SECRET, Env:DAILY_WEBHOOK_CONFIRM
  ```
- **Expected:** `registered: <uuid> ... state=ACTIVE events=participant.joined,participant.left retry=exponential`, `OK: the webhook is ACTIVE.`; `list` shows exactly one. Note the uuid. **Stop if:** Daily refuses, the state is not ACTIVE, or more than one webhook points at the URL.
- **Rollback:** `$env:DAILY_WEBHOOK_CONFIRM = "DELETE <uuid>"; node backend/scripts/ops/daily-webhook-production.js delete <uuid>`. Without it, meetings still work and attendance falls to the Needs Review queue.

### Step 8: configure and verify Frankfurt regional routing (separate authorisation; a Daily account setting)

- **Preconditions:** step 7 done; **0 rooms exist** (the tool refuses otherwise); the owner's approval is for the technical region only (see `advisory-daily-frankfurt-config.md`).
- **Action:**
  ```powershell
  node backend/scripts/ops/daily-domain-geo.js show                       # read only: geo must be null; recording/transcription DISABLED; rooms 0
  $env:DAILY_GEO_CONFIRM = "SET-DAILY-GEO eu-central-1 ON ruwadstudio"
  node backend/scripts/ops/daily-domain-geo.js set eu-central-1
  Remove-Item Env:DAILY_GEO_CONFIRM
  node backend/scripts/ops/daily-domain-geo.js show                       # read-back: geo "eu-central-1"
  ```
- **Expected:** `POST / {"properties":{"geo":"eu-central-1"}} -> HTTP 200`, `read-back geo: "eu-central-1" (as requested)`, `other settings changed by this request: none`, `DONE`. **Stop if:** Daily rejects the property, the read-back differs, any other setting changed, or rooms already exist.
- **Later verification (step 11):** the first test meeting's media region in Daily's dashboard must be Frankfurt.
- **Rollback:** `$env:DAILY_GEO_CONFIRM="RESTORE-DAILY-GEO ON ruwadstudio"; node backend/scripts/ops/daily-domain-geo.js restore` (sends `geo: null`; Daily does not document unsetting, so if it is not accepted the tool says so and the fallback is the dashboard or help@daily.co, with `docs/evidence/daily-domain-config-before-2026-10-29.json` as the reference).
- **Limits (not removed by this step):** metadata, logs, account data and webhook processing remain US-hosted at Daily; see `advisory-daily-frankfurt-config.md` section 10. **Regional routing does not establish PDPL compliance.**

### Step 9: responsible team confirms the cross-border and PDPL review (gate; no command)

- **What must be confirmed and recorded by the owner:** the responsible team has reviewed Daily.co's cross-border processing **in the light of the facts in `advisory-daily-frankfurt-config.md` section 10** (media to Frankfurt; names, ids and IP addresses, logs and account data in Daily's US-hosted systems; no Saudi or Gulf region exists) and the applicable Saudi PDPL requirements, and accepts it, or has instructed changes first (for example neutral display names, or a different arrangement). I cannot make or verify that review.
- **Blocks:** step 10. **If not confirmed: do not add the Vercel flag.** The backend can stay live with no visible entry point and no meeting can be created. **Rollback:** n/a.

### Step 10: enable `NEXT_PUBLIC_ADVISORY_ENABLED=true` in Vercel (separate authorisation; the owner uses the dashboard)

- **Preconditions:** steps 6, 7, 8 and 9 done; the Vercel build from step 5 is Ready; note the current production deployment (the instant-rollback target).
- **Action:** Vercel, project, Settings, Environment Variables: add `NEXT_PUBLIC_ADVISORY_ENABLED` = `true`, **Production only**. Deployments: **Redeploy** the latest Production deployment with "use existing build cache" **off** (the value is inlined at build time).
- **Expected / verify:** the new deployment is Ready and Current; `curl.exe -s -o NUL -w "%{http_code}`n" https://www.ruwad.studio/discover/advisory-services` returns 200 with no advisors listed; the Discover menu shows Advisory Services; `/dashboard`, `/startups`, `/investors` unchanged. **Stop if:** the build fails (the previous deployment keeps serving) or any existing page changed.
- **Rollback:** remove the variable and redeploy, or promote the previous production deployment (instant).

### Step 11: controlled live smoke test (separate authorisation; real records, real emails)

Runbook section 8, with the administrator account (A) and the second account (B): B applies; A approves; B sets hours and a service; A books the earliest slot (optionally check that a third pending request is refused); B approves; both join (one rejoins) and leave; check each person's attendance; B concludes it; **in Daily's dashboard confirm the session's media region is Frankfurt and recording and transcription are off**; then keep B as the first real advisor or **Suspend** B. Emails go to the owner mailboxes and `ruwadplatform@gmail.com`.
- **Stop if:** an expected email does not arrive, the room does not open, attendance is not recorded within a minute, the region is not Frankfurt, or an error appears in the Lightsail logs. **Rollback:** Vercel first (hide the feature), then the rest; data is kept.

### Step 12: monitor for 24 hours

Lightsail logs (5xx, email failures), Vercel errors, the Daily webhook state (must stay ACTIVE), Resend delivery, the Needs Review queue, incoming applications. The scheduler runs every 60 seconds.

## 6. Rollback commands (reverse order)

```powershell
# step 10: Vercel dashboard: remove NEXT_PUBLIC_ADVISORY_ENABLED and redeploy, or promote the previous production deployment
# step 8: restore the Daily region (original: null)
$env:DAILY_GEO_CONFIRM = "RESTORE-DAILY-GEO ON ruwadstudio"; node backend/scripts/ops/daily-domain-geo.js restore; Remove-Item Env:DAILY_GEO_CONFIRM
# step 7: remove the webhook
$env:DAILY_API_KEY = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
$env:DAILY_WEBHOOK_CONFIRM = "DELETE <uuid>"; node backend/scripts/ops/daily-webhook-production.js delete <uuid>
# steps 4 and 5: look first, then act (use the real version numbers that plan shows)
node backend/scripts/ops/lightsail-rollback.js plan 11     # old code, Advisory settings kept
node backend/scripts/ops/lightsail-rollback.js plan 10     # old code, original environment including APP_URL
$env:LIGHTSAIL_ROLLBACK_CONFIRM = "ROLLBACK-LIGHTSAIL ruwad-backend TO-VERSION-10"; node backend/scripts/ops/lightsail-rollback.js apply 10
# step 3: normally leave the additive tables; reverting drops their data and there is NO backup (runbook section 11, level 5)
```

`lightsail-rollback.js` takes `plan|apply <version> [--profile ruwad]`; it refuses placeholder (nginx) versions and rolls forward as a new deployment copying the target's exact image, environment, ports and health check.

## 7. Remaining risks

**Recovery risk (kept separate): the production database has no verified recoverable backup. The owner deferred it; it is an accepted, unresolved recovery risk (section 2).** The snapshot is not a backup.

**Compliance risks (unresolved until step 9 is recorded):**
1. **Saudi PDPL position of the whole Daily.co arrangement is not established.** Frankfurt covers live media only. Metadata, logs, account data and webhook processing remain in Daily's US-hosted systems, media from Saudi participants crosses the border (to Germany), and Daily's DPA does not mention Saudi law. Regional routing must not be read as compliance.
2. Frankfurt approval is a technical choice, not approval of all international personal-data processing.

**Operational risks:**
3. The Daily webhook, the domain-level region and live email have never been exercised against production; Daily's behaviour for unsetting `geo`, for existing rooms and for domain/room precedence is undocumented (mitigated by: 0 rooms, read-back checks, the dashboard check in step 11).
4. AWS login expires within hours (renew at step 1); one `micro` instance (brief connection resets at each Lightsail swap).
5. Local tests ran on PostgreSQL 18.4, production is 17.6 (the guard re-checks; the migrations use no version-specific features).
6. Render, Vercel, Resend, Daily billing, the second account and the mailbox are owner statements, not independent verifications (the Vercel flag's absence is the one verified from outside).

## 8. Recommendation

**Steps 1 to 8: GO**, each only on the owner's separate authorisation and with the no-backup risk accepted. **Step 9: NO-GO until the responsible team's confirmation is recorded. Step 10 (public activation): NO-GO until step 9 is recorded.** Steps 11 and 12 follow step 10. Everything that can be verified from here is verified; owner confirmations are recorded as owner statements.
