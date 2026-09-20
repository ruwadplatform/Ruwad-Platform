/* Runs one news/events collection and exits — for a Render Cron Job or any
 * external scheduler that can run a command instead of calling the HTTP
 * endpoint:
 *
 *   npm run content:refresh            # news + events
 *   npm run content:refresh -- news    # news only (every 6 hours)
 *   npm run content:refresh -- events  # events only (every 12 hours)
 *
 * Uses the same DATABASE_URL / SERPER_API_KEY environment as the API. The
 * in-process timer is switched off here so the run is exactly one pass.
 * Needs a prior `npm run build` (it loads the compiled app from dist/). */
process.env.CONTENT_REFRESH_INTERNAL = "false";
require("dotenv").config();

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/app.module");
const { ContentRefreshService } = require("../dist/content/content-refresh.service");

(async () => {
  const kind = process.argv[2] || "all";
  if (!["news", "events", "all"].includes(kind)) {
    console.error("Usage: content-refresh.js [news|events|all]");
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  try {
    const runs = await app.get(ContentRefreshService).refresh(kind);
    console.log(JSON.stringify(runs));
    process.exitCode = runs.some((r) => r.status === "failed") ? 1 : 0;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error("Content refresh failed:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
