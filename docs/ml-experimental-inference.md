# Experimental ML inference and the automatic RUWĀD assessment

**Model:** `exp-raisedNewRoundWithin6Months-6m-catboost-20261004070745` (CatBoost, target `raisedNewRoundWithin6Months`)
**Status:** `EXPERIMENTAL`. Trained on `RUWAD-REAL-DATASET-v1` (15 examples, 4 positive, 11 negative). Production validated: **NO**.
**Selection reason:** manual experimental configuration. **Statistical winner:** none. It is not "the best model".

## What a founder gets

```
Founder submits startup → SUBMITTED → admin reviews → admin APPROVES → startup PUBLISHED
   → ScoringService.recalculateStartupScore()                       (automatic)
   → official RUWĀD Score (deterministic, 6 engines; saved first)
   → experimental ML (async, never awaited) → ml_predictions        (automatic, if enough data)
→ My Startup: RUWĀD Score (or Pending) + six factors + data confidence, and a separate "Predictive Intelligence" card
```

* Admin approval is required **only to publish** the startup (`SubmissionsService.approve`, reached from the admin UI or the Accept link in
  the admin email). Nothing is created before approval: no directory row, no owner, no score. Reject and request-changes publish nothing.
  Other listing kinds (investor, hub, research, multinational) follow the same approval flow, unchanged.
* After approval no further admin action is needed: the same call runs scoring and then hands the startup to the experimental ML step.
  The founder never requests scoring. Verification affects confidence and provenance only (`ADMIN_VERIFIED` is never required).
* `recalculateStartupScore()` is the single orchestrator; nothing is duplicated.
* `RULE_WEIGHT = 1`, `ML_WEIGHT = 0`. The ML result is stored beside the score and never read by `ScoringService`.

## Safety invariants (enforced in code and covered by tests)

| Invariant | Where |
|---|---|
| ML never feeds the score | no read path from `ml_predictions` into `ScoringService`; verified identical score with inference ON / OFF / ON |
| Status is `EXPERIMENTAL` only | `MlExperimentalInferenceService.resolveModel()`; FastAPI refuses any model not flagged experimental |
| Model chosen by hand | one explicit `ML_EXPERIMENTAL_MODEL_VERSION`; never picked by metric |
| Kill switch | `ML_EXPERIMENTAL_INFERENCE_ENABLED` must be exactly `"true"`; independent of `ML_SCORING_ENABLED` |
| Allow-listed inputs only | `experimental-inference.logic.ts#assembleInput` (numbers/booleans from `ML-FEATURES-1.0`; no names, contacts, text, score) |
| No fake number | FastAPI returns `INSUFFICIENT_DATA`; a marker row with a null prediction is stored |
| Reliability capped | `VERY_LOW` / `LOW` only |
| Failures contained | every failure becomes a reason code (`TIMEOUT`, `NETWORK`, `AUTH_FAILED`, ...); no stack traces leave the service |
| Append-only history, no duplicates | one row per distinct input (`inputHash`); unchanged input adds nothing |
| Private | owner/admin only; the public profile has no route to it |

## Production architecture

```
Browser ──► ruwad-frontend (Next.js)  ──►  ruwad-backend (NestJS) ──Bearer ML_SERVICE_TOKEN──► ruwad-ml (FastAPI)
                                                │                                                │
                                           Supabase Postgres                       packaged, hash-verified artifact
```

The frontend never calls FastAPI. `ruwad-ml` is a separate Render web service defined in `render.yaml`:

* inference only: `/health`, `POST /predict`, `POST /predict/batch`, `POST /predict/experimental`, `GET /models`. There is no training,
  upload or admin route. Interactive docs and the OpenAPI document are off in production mode.
* every prediction route (and `/models`) needs `Authorization: Bearer $ML_SERVICE_TOKEN` (constant-time compare; an unset token makes
  the service answer 503, never predict).
* build: `pip install -r requirements-inference.txt`; start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; health: `/health`.
  The requirements are pinned to the versions the artifact was trained with and exclude training libraries, SHAP and XGBoost
  (the optional per-feature "drivers" are therefore absent in production; the prediction does not depend on them).

### Model artifact

* Location: `ml/model_artifacts/<modelVersion>/` in git (tracked, small), pinned by `ml/model_manifest.json`.
* Files: `estimator.joblib` (CatBoost, about 30 KB), `preprocessor.joblib` (column-name lists only), `metadata.json` (aggregate metrics,
  no rows), `training_profile.json` (per-feature counts and coarse bounds). About 36 KB in total.
* Contains no training rows, names, identifiers, PitchBook data or source documents (checked by `tests/test_artifact_integrity.py`).
  A CatBoost model necessarily encodes split thresholds learned from its 15 examples; that is the learned model itself.
* `training_profile.json` in git is intentionally coarser than the local one (lower bound halved, upper bound doubled, rounded outward
  to one significant figure) so no individual company's value is recoverable from it.
* The dataset CSV, `ml/artifacts/` and `ml/datasets/` stay out of git.
* Packaging is repeatable: `python -m app.inference.package_artifact --model-version <version>` (write-once; refuses a non-experimental model).

### Integrity (service startup / every health check)

With `REQUIRE_VERIFIED_ARTIFACTS=true` the service serves **only** `ML_EXPERIMENTAL_MODEL_VERSION` and, **before unpickling**, checks:
every file's SHA-256 against the manifest, no unexpected files, and `modelVersion`, `targetName`, `targetVersion`,
`featureSchemaVersion`, `algorithm`, the experimental flag and the dataset fingerprint against the manifest. Any mismatch makes the model
unavailable (predictions answer 404) and `/health` answers **503** `degraded`. `/health` otherwise returns, without paths or secrets:

```json
{"status":"ok","modelsAvailable":1,"modelLoaded":true,"modelVersion":"exp-…","statusType":"EXPERIMENTAL","artifactVerified":true,"featureSchemaVersion":"ML-FEATURES-1.0","targetVersion":"FUNDING-6M-v1"}
```

### Environment

`ruwad-ml` (set by `render.yaml`): `PYTHON_VERSION=3.12.10`, `ARTIFACT_DIR=model_artifacts`, `REQUIRE_VERIFIED_ARTIFACTS=true`,
`ML_EXPERIMENTAL_MODEL_VERSION=<exact version>`, `ML_SERVICE_TOKEN` (generated by Render, never in git).

`ruwad-backend`: `ML_SERVICE_TOKEN` (referenced from `ruwad-ml` via `fromService`), `ML_EXPERIMENTAL_MODEL_VERSION`,
`ML_SCORING_TIMEOUT_MS=3000`, and two **dashboard-owned** values (`sync: false`, so a Blueprint sync can never flip them):
`ML_SCORING_SERVICE_URL` (the `ruwad-ml` URL) and `ML_EXPERIMENTAL_INFERENCE_ENABLED`.
`ML_SCORING_ENABLED` is not set, so shadow scoring stays off.

## Go-live runbook (order matters)

1. Push `master`. The backend and frontend redeploy; inference is still off (the flag is unset), so founders see no prediction card.
   Migration `1793300000000` is already applied to the shared database and is skipped.
2. Render creates `ruwad-ml` from the Blueprint (approve the Blueprint sync if asked). Wait for the deploy to be healthy.
3. `GET https://<ruwad-ml>.onrender.com/health` → 200 with `modelLoaded` and `artifactVerified` true. (503 means the artifact did not verify: do not proceed.)
4. In `ruwad-backend` set `ML_SCORING_SERVICE_URL=https://<ruwad-ml>.onrender.com` (no trailing slash). Leave the enable flag unset.
5. Run `backend/scripts/ml-production-smoke.js` (see its header) for FastAPI auth and one authenticated prediction, plus the
   permission checks on a controlled test startup.
6. Set `ML_EXPERIMENTAL_INFERENCE_ENABLED=true` on `ruwad-backend`. Re-run the smoke script and confirm the owner card, the unchanged score,
   and that the public profile has no prediction.
7. Only then run the admin batch (`POST /api/ml-data/experimental/batch`). It is sequential and idempotent.

### Rollback

Set `ML_EXPERIMENTAL_INFERENCE_ENABLED=false` (or delete it) on `ruwad-backend`. Predictions stop and the founder card disappears;
the RUWĀD Score is unaffected. No database change is needed. Stored rows are kept.

### Free-plan caveat

On Render's free plan `ruwad-ml` (and the backend) sleep when idle. A prediction that arrives while `ruwad-ml` is waking times out
(3 s) and is logged as a failure; nothing is stored and the score is unaffected. The next meaningful change or an admin batch fills it in.
For reliable live predictions use an always-on plan for `ruwad-ml`.

## Later

* Add further predictive models by appending to `PredictiveIntelligence.models`; only models that exist are listed.
* `POST /api/ml-data/experimental/evaluate` compares matured predictions with outcomes. It never promotes a model.
