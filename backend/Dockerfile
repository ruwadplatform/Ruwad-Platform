# RUWĀD backend container (NestJS). Build from the REPOSITORY ROOT so the npm workspace lockfile is available:
#   docker build -f backend/Dockerfile -t ruwad-backend .
#
# Runtime configuration comes entirely from environment variables (DATABASE_URL, JWT_SECRET, …) — nothing secret is baked in.
# Dev dependencies stay installed on purpose: the start command runs the TypeORM migration CLI (which needs `dotenv`), exactly like
# `npm run deploy:start` did on Render.
FROM node:22-bookworm-slim

# Toolchain only as a fallback in case a native module (bcrypt) has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Install first (cached unless a package manifest changes). frontend/package.json is needed so the workspace lockfile resolves.
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace=backend --include=dev

COPY backend backend
RUN npm run build --workspace=backend

RUN useradd --system --uid 10001 --home /app ruwad && chown -R ruwad /app
USER ruwad

WORKDIR /app/backend
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations (compiled) unless RUN_MIGRATIONS=false, then start the API. The AWS service runs with RUN_MIGRATIONS=false while it
# shares the database with the Render backend, so only one of them ever applies schema changes.
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then node ../node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js; fi && exec node dist/main.js"]
