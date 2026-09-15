# Deploying RUWĀD

Production architecture: **Vercel** (Next.js frontend) → **Render** (NestJS backend, always-on) → **Supabase** (Postgres). Render does not provision or own the database — Supabase is the permanent, standalone database in every environment, local dev included.

## Backend (`backend/`) — Render

1. Push this repo to GitHub/GitLab.
2. In Render, "New +" → "Blueprint" → point at the repo. `render.yaml` (repo root) provisions `ruwad-backend` — a Node web service, `rootDir: backend`, building with `npm install && npm run build` and starting with `npm run deploy:start` (runs pending migrations, then `node dist/main.js`, bound to `0.0.0.0:$PORT`).
3. **`DATABASE_URL` must be set manually** in the Render dashboard (Environment tab) after the first deploy — `render.yaml` deliberately does not carry a real value (`sync: false`), so it's never committed to git. Paste the Supabase connection string: Supabase Dashboard → your project → Project Settings → Database → Connection string → URI. `DATABASE_SSL=true` is already set by the blueprint.
4. `JWT_SECRET` is generated automatically by the blueprint. After the frontend is deployed to Vercel, set `FRONTEND_URL` to its real origin (comma-separated if there's more than one, e.g. a preview + production domain) — CORS and the auth cookie's `sameSite`/`secure` behavior both depend on this being correct.
5. **Build-time devDependencies**: `npm run migration:run` shells out to `typeorm-ts-node-commonjs`, which needs `ts-node`/`typescript` — devDependencies, not regular dependencies. Confirm Render's build step installs them (Render's default Node build does; if `NODE_ENV=production` is set *before* the install step in a custom build command, `npm install` skips devDependencies and the migration step will fail at boot). The `render.yaml` here sets `NODE_ENV=production` only as a runtime env var, not a build-time one, so this isn't a problem with the default blueprint — just don't change the build command to prefix it with `NODE_ENV=production npm install`.
6. Migrations run against whatever `DATABASE_URL` is set to, i.e. Supabase — the same schema already used in local dev, so a first deploy typically has nothing pending. Do not manually recreate tables or run `synchronize` — TypeORM migrations are the only schema-change path in every environment.
7. `/api/docs` (Swagger) is disabled automatically in production (`NODE_ENV=production`) per the security baseline — don't flip that in production.
8. Health check: `GET /api/health` (already set as `healthCheckPath` in the blueprint) returns `{"status":"ok","database":"up"}`, or `{"status":"degraded","database":"down"}` with a 200 if the DB is unreachable — Render's health check only looks at the HTTP status, so a `degraded` body still needs the endpoint to actually be reachable to matter. `GET /api/health/database` is a narrower DB-only check for manual debugging.
9. This app does not use the Supabase client SDK, Supabase Auth, or the Supabase REST/anon/service-role API anywhere — Supabase here is purely the Postgres host, reached only through `DATABASE_URL` via TypeORM/`pg`. There is nothing to configure for `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` because the app never references them; don't add them speculatively.

## Frontend (`frontend/`) — Vercel

1. In Vercel, "Add New" → "Project" → import this repo. Set the project's **Root Directory** to `frontend` (Vercel auto-detects Next.js — no `vercel.json` needed for a standard App Router build).
2. Add one environment variable in Vercel (Project → Settings → Environment Variables), for both Preview and Production: `NEXT_PUBLIC_API_URL` = the deployed backend's public URL + `/api` (e.g. `https://ruwad-backend.onrender.com/api`). This is a build-time value (`NEXT_PUBLIC_*` vars are inlined into the client bundle) — changing it requires a redeploy, not just a restart. See `frontend/.env.example`.
3. Deploy. Once you have the real Vercel domain (production, and any preview domains you rely on), set the backend's `FRONTEND_URL` on Render to that origin (step 4 above) and redeploy the backend so CORS and the auth cookie's cross-site attributes match. Until `FRONTEND_URL` is correct, login/signup will appear to succeed (the API call itself works) but the session cookie won't be accepted by the browser, so the app will look logged-out immediately after.
4. Never set `NEXT_PUBLIC_API_URL` to a `localhost` address in a Vercel environment — Vercel's build/runtime has no route to your machine. The frontend already has no code path that silently falls back to `localhost` in a way that would work in production; the one local fallback in `src/lib/api/client.ts` only matters if this variable is left unset entirely, which would break every API call in Vercel and should be treated as a misconfiguration to fix, not a working fallback.

## CORS

`backend/src/main.ts` builds the CORS allowlist from `FRONTEND_URL` (comma-separated, `credentials: true`) — never `origin: "*"`, since the auth cookie requires credentialed requests. Local dev's default (`http://localhost:5174` — this project's actual frontend dev port, set via `next dev --port 5174` in `frontend/package.json`, not Next.js's default 3000) only applies when `FRONTEND_URL` is unset; production must always set it explicitly to the real Vercel origin.

## Local development

- From the repo root: `npm install` (installs both workspaces), then `npm run dev` starts both frontend and backend together against Supabase (the standard database — see the root README's Database section). `npm run dev:frontend` / `npm run dev:backend` start just one; `npm run dev:local-db` runs the full stack against the local embedded Postgres fallback instead.
- Backend: `.env` (in `backend/`) holds `DATABASE_URL` (Supabase connection string) and `DATABASE_SSL=true`. See `backend/.env.example`.
- Frontend: `.env.local` (in `frontend/`) holds `NEXT_PUBLIC_API_URL=http://localhost:4000/api`. See `frontend/.env.example`.
- No credentials in either `.env.example` are real — `render.yaml`'s `generateValue: true` for `JWT_SECRET` means Render mints a fresh one at provision time; `DATABASE_URL` is set manually in the Render dashboard (`sync: false`, never committed). Nothing here needs to be filled in or committed as a secret. Both `backend/.gitignore` and `frontend/.gitignore` already exclude every `.env*` variant.
