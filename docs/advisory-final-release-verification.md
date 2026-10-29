# Advisory Services: final release verification (2026-10-29)

Read-only throughout. Nothing was pushed, merged, deployed, applied, registered or changed, and no production secret was generated or stored (the throwaway secret used to rehearse the wrapper existed only in memory).

## Verdict

| | |
| --- | --- |
| **Technical readiness: GO** | The release candidate, migrations, environment change, tooling and rollback are verified and consistent. |
| **Authorisation to execute: NO-GO (not yet)** | Four things only the owner can supply are still open (below). Nothing production-changing runs until each step is explicitly authorised. |

## Verification results

| # | Check | Result |
| --- | --- | --- |
| 1 | Branch and commit | **PASS.** `feature/advisory-services` at `0ddaeec` (plus the final documentation/tooling commit that carries this report). 0 behind `origin/master` (`e78d361`), not pushed, tree clean except the untracked seed script. **No runtime code has changed since `2998868`.** All 46 restored UI files are byte-identical to production. |
| 2 | Production migration readiness | **PASS.** Read-only plan: PostgreSQL 17.6, `btree_gist` installed, **exactly 4 pending, 0 applied, READY**: `CreateAdvisoryServices1794300000000`, `AdvisoryAutomationAndMeetings1794400000000`, `AdvisorApplications1794500000000`, `AdvisoryPresenceEvents1794600000000`, one transaction. |
| 3 | Baseline snapshot retained | **PASS.** Taken 2026-10-29 05:49 UTC: 66 tables, 1,536 rows, 37 migrations, no `advisory_*` table, counts and schema hashes only (no row data). It had only existed in a temporary folder, so a **durable copy is now in `docs/evidence/prod-baseline-2026-10-29.json`** (SHA-256 `4d31baee…11a9`, identical to the original). Take a fresh baseline immediately before the window. |
| 4 | Lightsail version 10 after login | **PASS.** AWS authenticated (`ruwad-admin`). Service RUNNING, micro, scale 1. **Deployment 10 ACTIVE, image `api.8`, 24 variables**, nothing pending. The audit still reports exactly the 8 expected items (7 Advisory variables missing, `APP_URL` to update). |
| 5 | Wrapper preserves unrelated variables | **PASS.** Applying the wrapper's change to the real current environment (modelled with the helper's exact logic, compared by value hash, names only): **23 of 23 unrelated variables identical, 0 removed, 7 added, 1 updated (`APP_URL`), 24 to 31 variables.** `FRONTEND_URL`, `GOOGLE_REDIRECT_URI`, `PUBLIC_API_URL`, `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `TOKEN_ENCRYPTION_KEY` and the rest are identical. The helper rebuilds the container from image, environment and ports only; the current deployment has nothing else (`command` is empty, one container), so nothing is dropped, and the health check is copied as is. The wrapper's own `plan` against the real service listed exactly the 8 changes and created nothing; it refuses when Lightsail is not ACTIVE version 10. |
| 6 | Release order | **CONFIRMED** (below). |
| 7 | Rollback for every stage | **CONFIRMED** (below; new guarded tool `lightsail-rollback.js`, rehearsed read-only against the real service). |
| 8 | Dashboard confirmations and data residency | **OPEN** (below). |

Honest limits: the `apply` paths of the environment wrapper and of the rollback tool were deliberately **not executed** (they change production); they are guarded by exact confirmation phrases, and their read-only paths and refusals were exercised against the real service. The Daily webhook has never been exercised against production.

## Release order (confirmed, each step needs your authorisation)

| Step | Action | Command or owner | Gate |
| --- | --- | --- | --- |
| 0 | Fresh read-only baseline; `aws login --profile ruwad`; create the Daily webhook secret and key file only now | `prod-snapshot.js take`, owner, `daily-webhook-production.js gen-secret` | files exist, audit runs |
| 1 | **Migrations** (4, one transaction) | `advisory-migrate.js apply` with `BACKUP_REFERENCE="NO-BACKUP-OWNER-ACCEPTED-RISK-<date>"` and the exact phrase | `DONE`, then `prod-snapshot.js compare` prints `EXISTING SCHEMA UNCHANGED` |
| 2 | **Environment** (7 added, `APP_URL` updated; deployment 11) | `lightsail-advisory-env.js plan`, then `apply` | ACTIVE, health 200, audit READY |
| 3 | **Backend code:** you merge to `master`; the workflow deploys the image (environment preserved); Vercel builds with the flag still off | GitHub (owner) | workflow green; health 200; Advisory API 200 `[]`; webhook probe 401 |
| 4 | **Daily webhook** (only after the probe says 401) | `daily-webhook-production.js register` | one ACTIVE webhook |
| 5 | **Vercel activation:** add `NEXT_PUBLIC_ADVISORY_ENABLED=true`, redeploy | Vercel dashboard (owner) | `/discover/advisory-services` 200, menu shows it, existing pages unchanged |
| 6 | **Live smoke test** (real emails, real room) | runbook section 8 | all checks pass |

## Rollback, every stage (full table: runbook section 11.1)

| Stage | Undo with |
| --- | --- |
| 5 Vercel | remove the variable and redeploy, or promote the previous production deployment |
| 4 Webhook | `daily-webhook-production.js delete <uuid>` |
| 3 Backend code | `lightsail-rollback.js apply 11` (old code, Advisory settings kept) or `apply 10` (old code, original environment) |
| 2 Environment | `lightsail-rollback.js apply 10` (also restores `APP_URL`), or `set-lightsail-env.js --unset ...` |
| 1 Migrations | normally leave the additive tables in place; reverting drops their data and **no backup exists** |
| 6 Smoke test | suspend the canary advisor (data kept) |

A step that fails before completing needs no rollback (a failed migration applies nothing; a failed Lightsail deployment keeps the previous one; a failed Vercel build keeps the previous production deployment).

## Still open

**Dashboard confirmations (owner):**
1. Render: `ruwad-backend` is Suspended with auto-deploy off (the public URL still gives no answer, which is consistent but not proof); decide about `ruwad-ml`.
2. Vercel: no `NEXT_PUBLIC_ADVISORY_ENABLED` yet; production branch `master` with automatic deploys; note the current production deployment as the rollback target.
3. Resend: `karama.tech` shows Verified (the API key is send-only).
4. Daily: payment method if webhooks need one; usage alert.
5. `ruwadplatform@gmail.com` is read; a second real account exists for the smoke test.

**Decision (owner), still not given: Daily.co data residency and data protection.** Daily is a US provider, rooms are not region-pinned, the HIPAA add-on is off, nothing is recorded, and Daily receives only the user's opaque id, display name, room name and times. Either approve this arrangement explicitly (with counsel if required) or instruct me to add region pinning first. **This is a launch blocker until decided.**

**Accepted risk:** no database backup (deferred by the owner); the before/after snapshot comparison is the only safety evidence.
