# backend/scripts

Run from `backend/`. None of these are part of the deployed API.

| Folder | Script | Purpose | Run with |
|---|---|---|---|
| `dev/` | `local-postgres.js` | Starts the optional local Postgres (data in `backend/.pgdata`) | `npm run db:local` |
| `dev/` | `pgadmin-server.json` | pgAdmin import file for that local database | import in pgAdmin |
| `ops/` | `content-refresh.js` | Refreshes news and events once (needs `npm run build` first) | `npm run content:refresh -- all` |
| `ops/` | `ml-production-smoke.js` | Checks the deployed ML service end to end; see the header for the variables it needs | `node scripts/ops/ml-production-smoke.js` |

`dev/` is for your own machine. `ops/` scripts can touch production services, so read the header of each before running it.
