# Moving the RUWĀD backend from Render to AWS Lightsail — cutover runbook

Status: **cut over on 2026-10-19.** Production traffic goes Vercel → AWS Lightsail. Render is idle and kept untouched as the rollback target (keep it for at least 7 days). Sections 1–3 are kept as the record of what was done and as the rollback procedure.

| | Render (today) | AWS Lightsail (parallel) |
|---|---|---|
| URL | `https://ruwad-backend-e92x.onrender.com` | `https://ruwad-backend.vaykv052p845y.ap-southeast-2.cs.amazonlightsail.com` |
| Region | Oregon | Sydney (next to the Supabase database) |
| Always on | no (free tier sleeps; first request after idle ≈ 60 s) | yes |
| Deploys | Render auto-deploy | GitHub Actions → `ruwad-github-deploy` role (OIDC) on push to `master` touching `backend/**` |

Both use the **same Supabase database**, so no data moves and nothing is migrated: switching in either direction loses nothing.

## What was verified before this runbook was written

| Check | Result |
|---|---|
| Environment variables, Render vs AWS (compared by hash, no values shown) | **22 of 22 identical**, same 22 names on both; none only on one side. That includes `DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `SERPER_API_KEY`, `RESEND_API_KEY`, `ML_SERVICE_TOKEN`. So sessions stay valid and stored tokens stay readable. |
| Neither side has `ANTHROPIC_API_KEY` | Nothing is lost at cutover (résumé/report AI run in their no-key mode today as well). |
| AWS differs from Render **on purpose** in 4 settings | `GOOGLE_REDIRECT_URI` (Vercel callback), `PUBLIC_API_URL` (Vercel address, for email links), `RUN_MIGRATIONS=false`, `CONTENT_REFRESH_INTERNAL=false`. |
| Database | 37 of 37 migrations applied, 0 pending (read-only check). |
| Authenticated tests on AWS | Admin sign-in, AI Summary (Gemini) on startups and an investor, cached repeat in 0.5 s, Calendar connect URL, ML monitoring all pass. |
| Load / size | CPU peaks ≈ 3 %, memory ≈ 9 % on the Micro instance. |
| Vercel | **One** environment variable exists: `NEXT_PUBLIC_API_URL` (all environments), currently `https://ruwad-backend-e92x.onrender.com/api`. |
| Frontend builds | With `NEXT_PUBLIC_API_URL=<AWS>/api` the build proxies `/api/*` to AWS and the browser bundle contains the AWS address; with the Render value it proxies to Render. |
| Google OAuth | Both the **Render** and the **Vercel** callbacks are registered (the Vercel one was added before cutover and re-probed: Google accepts it). |

## 0. Before cutover — one manual step (done)

**Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 client → Authorized redirect URIs → add**

`https://ruwad-platform.vercel.app/api/calendar/google/callback`

Keep the Render one. The Vercel address is the right one because the browser reaches the API through Vercel and the OAuth state cookie lives on the Vercel domain; a callback on the backend's own domain would never receive it. Re-check afterwards: Google must send that callback on to its normal sign-in page instead of showing `redirect_uri_mismatch`.

## 1. Cut over (about 5 minutes; do this only after approval)

Vercel → Project `ruwad-platform` → Settings → Environment Variables → edit **`NEXT_PUBLIC_API_URL`** (it applies to all environments):

| | Value |
|---|---|
| Current (write it down — this is your rollback) | `https://ruwad-backend-e92x.onrender.com/api` |
| New | `https://ruwad-backend.vaykv052p845y.ap-southeast-2.cs.amazonlightsail.com/api` |

The format is: scheme + host, **then `/api`**, no trailing slash. **Do not add `BACKEND_URL`.** Next.js reads the proxy target from `NEXT_PUBLIC_API_URL` when `BACKEND_URL` is absent, so one variable moves both the `/api` proxy and the direct upload address. Then **Deployments → ⋯ on the latest production deployment → Redeploy** (a fresh build is required; the value is compiled in).

## 2. Verify straight after (5 minutes)

1. `https://ruwad-platform.vercel.app/api/health` returns `{"status":"ok","database":"up"}` **and the response no longer has an `Rndr-Id` header** (it has `X-RateLimit-Limit`); that proves the request reached AWS. Command: `curl -sI https://ruwad-platform.vercel.app/api/health`.
2. Sign in (an existing session should keep working); open a startup, the directories, a report.
3. AI Summary on a startup → text appears (Gemini).
4. Connect Google Calendar on an event → Google asks for consent, returns to the site connected.
5. Trigger one submission-approval email → its Approve/Reject link opens (it now uses the Vercel address).
6. Lightsail → Metrics: CPU/memory stay low.

## 3. Rollback (about 2 minutes, no data changes)

**Fastest:** Vercel → Deployments → the production deployment from just before the switch (commit `49961d1`, "Lightsail deploy role…", or whichever was current) → ⋯ → **Instant Rollback**. It restores that build, which has the Render address compiled in.

**Or undo the setting:** put the Render value back into `NEXT_PUBLIC_API_URL` and redeploy. (Because `BACKEND_URL` was never added, nothing else needs undoing.)

Before rolling back, **wake Render** so visitors don't wait about a minute: `curl https://ruwad-backend-e92x.onrender.com/api/health`.

Expect on rollback: nothing lost (same database); sessions keep working (same `JWT_SECRET`). Google Calendar through Render keeps using Render's own callback, which stays registered.

Keep Render running, untouched, for at least 7 days after cutover so this path remains available. Do **not** suspend or delete it before then.

> **Done after cutover (2026-10-19):** `Vercel NEXT_PUBLIC_API_URL` now points at AWS, and `CONTENT_REFRESH_INTERNAL` was removed on AWS (deployment 5), because Render sleeps without traffic and could no longer run the refresh. Only `RUN_MIGRATIONS=false` remains below.

## 4. After a quiet week — make AWS the single owner of background work

While both backends exist exactly **one** should own schema migrations. Today Render does and AWS skips them (`RUN_MIGRATIONS=false`). News/events refresh is safe on both (each run is guarded by a "running" row in the database), but it is only needed once. To retire Render:

```bash
node infra/aws/set-lightsail-env.js --unset RUN_MIGRATIONS --unset CONTENT_REFRESH_INTERNAL
```

- `CONTENT_REFRESH_INTERNAL` removed → in-process scheduler runs news every 6 h and events every 12 h, catching up from the last successful run stored in the database.
- `RUN_MIGRATIONS` removed → each deployment applies pending migrations before starting. If one fails, the new version never turns healthy and **Lightsail keeps serving the previous version**; read the log (`aws lightsail get-container-log …`).

Then suspend Render (**suspend, not delete**) and watch for a few days. Those Render actions are yours.

## 5. Day-to-day on AWS

- **Deploy:** push to `master` (changes under `backend/**`) → workflow *Deploy backend to AWS Lightsail* builds, pushes, activates, then checks `/api/health`. `[skip render]` in a commit message stops Render also deploying while both exist. Vercel builds on every push regardless.
- **Change a setting:** `node infra/aws/set-lightsail-env.js KEY=VALUE` (prints names only).
- **Cost:** Micro container ≈ $10/month. Budget `ruwad-monthly-15usd` emails at 80 % and 100 % of actual and 100 % forecast.

## 6. Known, not caused by cutover

- Large uploads (data room, pitch-deck autofill, résumé parse, report files, historical import) go straight to the backend domain with `credentials: include`. Since login now goes through the Vercel proxy, the cookie is on the Vercel domain, so these direct calls may already return 401 on Render today. AWS behaves the same. Try one upload on the live site before cutover to know the baseline; fixing it means routing uploads through the proxy (needs the Vercel body-size limit checked).
- The ML scoring service on Render still sleeps; its first request can take about a minute (the backend already waits for it).
- AWS's first byte from outside is slower than Render's CDN-fronted address (extra TLS time); server time is the same. A custom domain/CDN in front of Lightsail would close the gap.
