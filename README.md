# RUWĀD

Saudi & MENA healthcare innovation ecosystem platform — a Next.js frontend backed by a real NestJS + TypeORM + PostgreSQL API.

```
ruwad/
├── frontend/   — Next.js (App Router), TypeScript, plain-CSS design system
└── backend/    — NestJS, TypeORM, PostgreSQL
```

Both apps are the original, already-working codebases — this repo just holds them together as one project instead of two sibling folders, wired up with npm workspaces for a single `npm install` / `npm run dev`.

## Requirements

- Node.js 22.x, npm 11.x
- No local PostgreSQL install needed — `backend` boots a real embedded Postgres server on disk at `backend/.pgdata` (see `backend/scripts/local-postgres.js`); production points at a real managed Postgres via `DATABASE_URL`.

## Quick start

```bash
cd ruwad
npm install
npm run dev
```

This starts, concurrently, in one terminal:

| Service | URL |
|---|---|
| Frontend (Next.js) | http://localhost:5174 |
| Backend API | http://localhost:4000/api |
| Swagger docs (dev only) | http://localhost:4000/api/docs |
| Health check | http://localhost:4000/api/health |
| Local Postgres | `127.0.0.1:55432` (database `ruwad`) |

`npm install` at the root installs both workspaces' dependencies (`frontend` and `backend`) via npm workspaces — no need to `npm install` separately inside each folder.

## Running things separately

Useful when debugging one side in isolation:

```bash
npm run dev:backend    # NestJS only (nest start --watch) — needs the DB already running
npm run dev:frontend   # Next.js only
npm run dev:db         # just the local embedded Postgres
```

Or work directly inside a workspace as before:

```bash
cd backend && npm run start:dev
cd frontend && npm run dev
```

## Building, linting, typechecking

Each of these runs both workspaces from the root:

```bash
npm run build       # backend then frontend
npm run typecheck    # backend then frontend
npm run lint          # backend then frontend
```

Scoped variants exist too: `build:frontend`, `build:backend`, `typecheck:frontend`, `typecheck:backend`, `lint:frontend`, `lint:backend`.

## Database

- **Local dev**: `npm run dev` (or `npm run dev:db` alone) boots a real local PostgreSQL 18 server — not SQLite, not a mock — persisted at `backend/.pgdata`, so data survives restarts. First boot initializes the data directory and creates the `ruwad` database; later boots just start it.
- **Migrations**: schema changes are applied through TypeORM migrations only (`synchronize` is always `false`, including in development). From `backend/`:
  ```bash
  npm run migration:run       # apply pending migrations
  npm run migration:generate  # generate a new one from entity changes
  npm run migration:revert    # roll back the last one
  ```
  These also work as `npm run migration:run --workspace=backend` from the root.
- **Seeding**: `npm run seed` (root) or `cd backend && npm run seed` — idempotent, migrates the platform's real mock/reference data into Postgres. Safe to re-run; re-running updates existing rows by slug instead of duplicating them.

## Environment files

Secrets are kept separate per app and are never committed:

```
ruwad/
├── frontend/
│   ├── .env.local            (gitignored — real values)
│   └── .env.local.example    (committed — template)
│
└── backend/
    ├── .env                  (gitignored — real values)
    └── .env.example          (committed — template)
```

`frontend/.env.local` only ever needs `NEXT_PUBLIC_API_URL` (the backend's public API URL — anything prefixed `NEXT_PUBLIC_` ships to the browser, so nothing secret belongs there). `backend/.env` holds `DATABASE_URL`, `JWT_SECRET`, and the rest of the server-side config — see `backend/.env.example` for the full list. `DATABASE_URL` and `JWT_SECRET` must never be exposed to the frontend or committed to source control.

## Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) and [`render.yaml`](./render.yaml) — one Render Blueprint provisions a managed Postgres instance plus the two services (`rootDir: backend`, `rootDir: frontend`).
