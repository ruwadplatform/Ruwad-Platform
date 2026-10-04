#!/usr/bin/env node
/* One-startup production smoke test for the EXPERIMENTAL ML path. Read-only except the single prediction call; it never runs a batch and never
 * writes to the database itself. Secrets come from the environment and are never printed.
 *
 *   ML_URL=https://<ruwad-ml>.onrender.com   ML_SERVICE_TOKEN=<from the Render dashboard>   \
 *   API_URL=https://ruwad-backend-e92x.onrender.com/api   STARTUP_ID=<uuid of a test/controlled startup>   STARTUP_SLUG=<its slug>   \
 *   OWNER_EMAIL=... OWNER_PASSWORD=...   OTHER_EMAIL=... OTHER_PASSWORD=...   ADMIN_EMAIL=... ADMIN_PASSWORD=...   \
 *   node backend/scripts/ml-production-smoke.js
 *
 * Steps whose inputs are missing are reported as SKIPPED (never as passed). Exit code 1 if anything that ran failed.
 * Use accounts you already control (or a clearly named temporary test startup); do not use a real founder's account. */
const MODEL = process.env.ML_EXPERIMENTAL_MODEL_VERSION || "exp-raisedNewRoundWithin6Months-6m-catboost-20261004070745";
const { ML_URL, ML_SERVICE_TOKEN, API_URL, STARTUP_ID, STARTUP_SLUG } = process.env;
const results = [];
const record = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok === null ? "SKIP" : ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const need = (...vars) => vars.every((v) => process.env[v]);

async function req(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
    let json = null; try { json = await res.json(); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  } catch (e) { return { status: 0, json: null, error: e.message }; }
}
async function login(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) return null;
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

(async () => {
  // ---- 1. FastAPI ----
  if (ML_URL) {
    const h = await req(`${ML_URL}/health`);
    const j = h.json || {};
    record("FastAPI /health ready", h.status === 200 && j.modelLoaded === true && j.artifactVerified === true && j.statusType === "EXPERIMENTAL" && j.modelVersion === MODEL, `HTTP ${h.status} ${JSON.stringify({ modelLoaded: j.modelLoaded, artifactVerified: j.artifactVerified, statusType: j.statusType })}`);
    const body = JSON.stringify({ startupId: "smoke", featureSchemaVersion: "ML-FEATURES-1.0", features: { fundingRounds: 1, teamSize: 20, founderCount: 2 }, modelVersion: MODEL });
    const anon = await req(`${ML_URL}/predict/experimental`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    record("FastAPI prediction without a token is rejected", anon.status === 401 || anon.status === 403, `HTTP ${anon.status}`);
    const docs = await req(`${ML_URL}/docs`);
    record("FastAPI interactive docs are off", docs.status === 404, `HTTP ${docs.status}`);
    const models = await req(`${ML_URL}/models`);
    record("FastAPI /models is not anonymous", models.status === 401 || models.status === 403, `HTTP ${models.status}`);
    if (ML_SERVICE_TOKEN) {
      const p = await req(`${ML_URL}/predict/experimental`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ML_SERVICE_TOKEN}` }, body });
      record("FastAPI authenticated prediction", p.status === 200 && p.json && p.json.status === "OK" && p.json.modelStatus === "EXPERIMENTAL", `HTTP ${p.status} prediction=${p.json && p.json.prediction} reliability=${p.json && p.json.reliability}`);
    } else record("FastAPI authenticated prediction", null, "ML_SERVICE_TOKEN not provided");
  } else record("FastAPI checks", null, "ML_URL not provided");

  // ---- 2. Backend / permissions ----
  if (API_URL && STARTUP_ID) {
    const a = `${API_URL}/startups/${STARTUP_ID}/assessment`;
    record("Anonymous cannot read the assessment", (await req(a)).status === 401);
    if (STARTUP_SLUG) {
      const pub = await req(`${API_URL}/startups/${STARTUP_SLUG}`);
      const text = JSON.stringify(pub.json || {});
      const leaks = ["predictiveIntelligence", "estimatePercent", "inputFeatures", "modelVersion", "raisedNewRoundWithin6Months"].filter((k) => text.includes(k));
      record("Public profile contains no prediction", pub.status === 200 && leaks.length === 0, leaks.length ? `leaks: ${leaks}` : `HTTP ${pub.status}`);
    } else record("Public profile contains no prediction", null, "STARTUP_SLUG not provided");

    let ownerView = null;
    if (need("OWNER_EMAIL", "OWNER_PASSWORD")) {
      const c = await login(process.env.OWNER_EMAIL, process.env.OWNER_PASSWORD);
      const r = c ? await req(a, { headers: { Cookie: c } }) : { status: "login failed" };
      ownerView = r.json;
      const card = r.json && r.json.predictiveIntelligence && r.json.predictiveIntelligence.models[0];
      record("Owner can read the assessment", r.status === 200 && !!r.json, `HTTP ${r.status}`);
      if (card) {
        const s = JSON.stringify(card);
        record("Owner card is experimental, not in the score, and exposes no internals", card.experimental === true && card.includedInRuwadScore === false && !/modelVersion|inputFeatures|trainingRows|datasetVersion/.test(s), `status=${card.status} estimatePercent=${card.estimatePercent} reliability=${card.reliability}`);
      } else record("Owner card present", null, "no predictive card returned (inference may be off, or no card yet)");
    } else record("Owner can read the assessment", null, "OWNER_EMAIL/OWNER_PASSWORD not provided");
    if (need("OTHER_EMAIL", "OTHER_PASSWORD")) {
      const c = await login(process.env.OTHER_EMAIL, process.env.OTHER_PASSWORD);
      record("Unrelated signed-in user is refused", c ? (await req(a, { headers: { Cookie: c } })).status === 403 : false);
    } else record("Unrelated signed-in user is refused", null, "OTHER_EMAIL/OTHER_PASSWORD not provided");
    if (need("ADMIN_EMAIL", "ADMIN_PASSWORD")) {
      const c = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
      record("Admin can read the assessment", c ? (await req(a, { headers: { Cookie: c } })).status === 200 : false);
    } else record("Admin can read the assessment", null, "ADMIN_EMAIL/ADMIN_PASSWORD not provided");
    if (ownerView) console.log("official score as the owner sees it (compare before/after enabling inference):", JSON.stringify({ value: ownerView.ruwadScore.value, confidence: ownerView.ruwadScore.dataConfidence }));
  } else record("Backend / permission checks", null, "API_URL and STARTUP_ID not provided");

  const failed = results.filter((r) => r.ok === false).length;
  console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed} failed, ${results.filter((r) => r.ok === null).length} skipped`);
  process.exit(failed ? 1 : 0);
})();
