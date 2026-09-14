# Deploying to Render

This repo is one Render Blueprint (`render.yaml`, at the repo root) that provisions three things: a managed Postgres instance and two web services, one per `rootDir` (`backend`, `frontend`).

## Backend (`backend/`)

1. Push this repo to GitHub/GitLab.
2. In Render, "New +" → "Blueprint" → point at the repo. `render.yaml` provisions:
   - `ruwad-postgres` — a managed PostgreSQL instance (free tier).
   - `ruwad-backend` — a Node web service, `rootDir: backend`, building with `npm install && npm run build` and starting with `npm run deploy:start` (runs pending migrations, then `node dist/main.js`).
3. `DATABASE_URL` and `JWT_SECRET` are generated/wired automatically by the blueprint. After the service is live, set `FRONTEND_URL` to the deployed frontend's real origin (comma-separated if there's more than one, e.g. a preview + production domain) — CORS and the auth cookie's `sameSite` behavior depend on this being correct.
4. **Build-time devDependencies**: `npm run migration:run` shells out to `typeorm-ts-node-commonjs`, which needs `ts-node`/`typescript` — devDependencies, not regular dependencies. Confirm Render's build step installs them (Render's default Node build does; if `NODE_ENV=production` is set *before* the install step in a custom build command, `npm install` skips devDependencies and the migration step will fail at boot). The `render.yaml` here sets `NODE_ENV=production` only as a runtime env var, not a build-time one, so this isn't a problem with the default blueprint — just don't change the build command to prefix it with `NODE_ENV=production npm install`.
5. First deploy only: once the service is live and migrations have run, seed real ecosystem data by running `npm run seed` from a Render Shell (or locally with `DATABASE_URL` pointed at the Render Postgres instance). The seed script is idempotent — safe to re-run.
6. `/api/docs` (Swagger) is disabled automatically in production (`NODE_ENV=production`) per the security baseline — don't flip that in production.

## Frontend (`frontend/`)

1. Deploys as a separate Render **Web Service** (Node), `rootDir: frontend`, build `npm install && npm run build`, start `npm start` (Next.js) — or Render's Next.js preset if using their newer static/SSR detection.
2. Set `NEXT_PUBLIC_API_URL` to the deployed backend's public URL + `/api` (e.g. `https://ruwad-backend.onrender.com/api`). This is baked in at build time, so redeploy the frontend after changing it.
3. Once both are live, set the backend's `FRONTEND_URL` to this service's real origin (step 3 above) and redeploy the backend so CORS/cookie settings match.

## Local development (unchanged)

- From the repo root: `npm install` (installs both workspaces), then `npm run dev` starts both frontend and backend together. `npm run dev:frontend` / `npm run dev:backend` start just one.
- Backend: `npm run db:local --workspace=backend` (starts the embedded local Postgres) is already running as part of `npm run dev` from the root — see the root README. `.env` (in `backend/`) holds `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/ruwad`.
- Frontend: `.env.local` (in `frontend/`) holds `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.
- No credentials in this file are real — `render.yaml`'s `generateValue: true` for `JWT_SECRET` means Render mints a fresh one at provision time; nothing here needs to be filled in or committed as a secret.
