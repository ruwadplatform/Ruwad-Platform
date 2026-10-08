# Deploying RUWĀD

Production architecture: the Next.js frontend is hosted on **Vercel**; **Render** hosts two services — `ruwad-backend` (NestJS) and `ruwad-ml` (FastAPI, internal; setup in [ml-experimental-inference.md](./ml-experimental-inference.md)), each its own web service with its own `onrender.com` URL — in front of **Supabase** (Postgres). Render does not provision or own the database — Supabase is the permanent, standalone database in every environment, local dev included.

## Backend and ML — Render Blueprint

`render.yaml` (repo root) provisions the backend and the ML service in one Blueprint. The frontend is not part of it (see "Frontend on Vercel" below).

1. Push this repo to GitHub/GitLab.
2. In Render, "New +" → "Blueprint" → point at the repo. Confirm the branch (`master`) and that the Blueprint Path is blank (defaults to `render.yaml` at the repo root, which is correct).
3. Before clicking Deploy, fill in `DATABASE_URL` for `ruwad-backend` — `render.yaml` deliberately does not carry a real value (`sync: false`), so it's never committed to git. Use the Supabase **Session pooler** connection string, not the direct connection string — see "Database connectivity" below for why.
4. `ANTHROPIC_API_KEY` (also `sync: false`) is optional — only needed for the signup wizard's résumé-autofill endpoint. Leave blank if you don't want that feature live yet.
5. `JWT_SECRET` is generated automatically by the blueprint.
6. Click Deploy. Render builds and starts the backend and ML services.
7. Deploy the frontend on Vercel (next section), then make sure `ruwad-backend`'s `FRONTEND_URL` and `APP_URL` are the Vercel address.

## Frontend on Vercel

1. In Vercel: Add New → Project → import the GitHub repo. Set **Root Directory** to `frontend`; leave the framework (Next.js) and the build/install commands on their defaults.
2. Environment variable (Production and Preview): `NEXT_PUBLIC_API_URL` = the backend URL + `/api` (e.g. `https://ruwad-backend-e92x.onrender.com/api`). It is a build-time value, baked into the client bundle: changing it needs a redeploy. Do not put any backend variable (`DATABASE_URL`, `GOOGLE_*`, ...) in the Vercel project; the frontend never needs them.
3. On Render, `ruwad-backend`'s `FRONTEND_URL` (CORS allowlist, comma-separated) and `APP_URL` (links in emails) must be the production Vercel address (`render.yaml` sets both to `https://ruwad-platform.vercel.app`). Vercel preview deployments have different URLs and are blocked by CORS unless added to `FRONTEND_URL`.

Until `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` are both correct, login/signup will appear to work (the API call succeeds) but the browser will not accept the session cookie, so the app looks logged-out immediately after — the most common thing to get bitten by after a first deploy. The cookie is a cross-site one (`sameSite: "none"`) because `vercel.app` and `onrender.com` are different sites; hosting the frontend and the API on subdomains of one custom domain would let it become a first-party cookie.

## Database connectivity (important)

Render's network cannot reach Supabase's **direct** database connection in most regions — it resolves to an IPv6-only address and Render's egress doesn't route to it, failing with `ENETUNREACH`. Use the **Session pooler** connection string instead (Supabase Dashboard → your project → **Connect** button → Session pooler → URI) — it's IPv4-proxied. The username changes shape too: `postgres.<project-ref>` instead of plain `postgres`. If your password has special characters, percent-encode them in the URL (`@` → `%40`, etc.) — Supabase's dialog shows a `[YOUR-PASSWORD]` placeholder, not the real value; you have to fill it in yourself.

## Build-time devDependencies (Render services)

Render skips devDependencies during `npm install` whenever `NODE_ENV=production` is set in the service's environment, and applies that during the build step too — not just at runtime. The backend needs devDependency-only tools to build:
- Backend: `nest build` (`@nestjs/cli`) and `npm run migration:run` (`typeorm-ts-node-commonjs`, needing `ts-node`/`typescript`). Without `--include=dev`, fails with `sh: 1: nest: not found`.
- Frontend: `next build` needs `@tailwindcss/postcss` to process CSS via `postcss.config.mjs`. Without `--include=dev`, the build fails partway through CSS processing with a generic `npm error Lifecycle script 'build' failed with error: code 1` — the real cause only shows up a few lines up the stack trace, inside `postcss.ts`.

The backend's `buildCommand` in `render.yaml` therefore passes `--include=dev` explicitly. Keep that flag if you ever change it.

## Port binding

The Render services must listen on whatever port Render assigns via the `PORT` env var, not a hardcoded one:
- Backend: `main.ts` calls `app.listen(port, "0.0.0.0")` with `port` read from `config.get("PORT")`, and `render.yaml` pins it to `4000` explicitly (Render respects an explicit `PORT` override the same way it does its own default injection).
- Frontend: hosted on Vercel, which manages the port itself. `frontend/package.json`'s `start` script still avoids a hardcoded `--port`, so it also runs on any host that sets `PORT`.

## CORS

`backend/src/main.ts` builds the CORS allowlist from `FRONTEND_URL` (comma-separated, `credentials: true`) — never `origin: "*"`, since the auth cookie requires credentialed requests. Local dev's default (`http://localhost:5174` — this project's actual frontend dev port, set via `next dev --port 5174`, not Next.js's default 3000) only applies when `FRONTEND_URL` is unset; production must always set it explicitly to the real frontend origin.

**A correctly-configured CORS allowlist is not sufficient on its own.** Helmet's default `Cross-Origin-Resource-Policy: same-origin` header blocks the browser from reading any response to this API from a different origin — this is enforced independently of CORS, so the preflight and `Access-Control-Allow-Origin` can both be perfectly correct and real requests still fail client-side with a generic `Failed to fetch`, no CORS error shown at all. `main.ts` passes `crossOriginResourcePolicy: { policy: "cross-origin" }` to `helmet()` to fix this — required precisely because the frontend and backend are separate Render services/origins by design. If you ever see requests silently fail this way despite CORS headers looking right in `curl`, check this header first (`curl -i ... | grep -i cross-origin-resource-policy`).

The auth cookie itself uses `sameSite: "none"; secure: true` in production (`backend/src/auth/auth.controller.ts`) because the frontend (`vercel.app`) and the backend (`onrender.com`) are different sites — both are public-suffix domains, so every subdomain counts as its own "site" for cookie purposes.

## This app's relationship to Supabase

This app does not use the Supabase client SDK, Supabase Auth, or the Supabase REST/anon/service-role API anywhere — Supabase here is purely the Postgres host, reached only through `DATABASE_URL` via TypeORM/`pg`. There is nothing to configure for `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` because the app never references them; don't add them speculatively.

## Health check

`GET /api/health` (set as the backend's `healthCheckPath` in the blueprint) returns `{"status":"ok","database":"up"}`, or `{"status":"degraded","database":"down"}` with a 200 if the DB is unreachable — Render's health check only looks at the HTTP status, so a `degraded` body still needs the endpoint to actually be reachable to matter. `GET /api/health/database` is a narrower DB-only check for manual debugging. `/api/docs` (Swagger) is disabled automatically in production (`NODE_ENV=production`) per the security baseline.

## Local development

- From the repo root: `npm install` (installs both workspaces), then `npm run dev` starts both frontend and backend together against Supabase (the standard database — see the root README's Database section). `npm run dev:frontend` / `npm run dev:backend` start just one; `npm run dev:local-db` runs the full stack against the local embedded Postgres fallback instead.
- Backend: `.env` (in `backend/`) holds `DATABASE_URL` (Supabase connection string) and `DATABASE_SSL=true`. See `backend/.env.example`.
- Frontend: `.env.local` (in `frontend/`) holds `NEXT_PUBLIC_API_URL=http://localhost:4000/api`. See `frontend/.env.example`.
- No credentials in either `.env.example` are real — `render.yaml`'s `generateValue: true` for `JWT_SECRET` means Render mints a fresh one at provision time; `DATABASE_URL` is set manually in the Render dashboard (`sync: false`, never committed). Nothing here needs to be filled in or committed as a secret. Both `backend/.gitignore` and `frontend/.gitignore` already exclude every `.env*` variant.
