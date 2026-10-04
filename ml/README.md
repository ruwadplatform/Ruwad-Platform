# RUWĀD ML Training & Shadow-Prediction Service

Trains and serves target-specific models (e.g. "will this startup raise a
new round within 12 months") for RUWĀD. **This service never influences the
public RUWĀD Score.** It is a separate, internal, shadow-only system — see
[`docs/ml-training-methodology.md`](../docs/ml-training-methodology.md) for
the full design and the rules that keep it that way.

## Setup

```bash
cd ml
python -m venv .venv
.venv/Scripts/activate        # Windows; `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # fill in RUWAD_ADMIN_EMAIL / RUWAD_ADMIN_PASSWORD / ML_SERVICE_TOKEN
```

LightGBM is optional (not in `requirements.txt`):

```bash
pip install -r requirements-optional.txt
```

## Training (CLI only — never an HTTP endpoint)

```bash
python -m app.training.train --target raisedNewRoundWithin12Months
python -m app.training.train --target raisedNewRoundWithin12Months --algorithms catboost,xgboost
python -m app.training.train --target raisedNewRoundWithin12Months --test-only   # synthetic fixture, always TEST_ONLY
```

A real run (no `--test-only`) checks the backend's readiness gate
(`GET /ml-data/readiness/:target`) first and refuses to train — printing
exactly why — if the dataset isn't ready yet. `--test-only` is the *only*
flag that skips this gate; it also switches the dataset source to the
synthetic fixture under `tests/fixtures/synthetic_dataset.py` and force-tags
every resulting training run and model `TEST_ONLY`.

Each requested algorithm is trained, evaluated (val + test), calibrated
(classification, fit on val only), explained (SHAP, tree models only), and
— except for the baselines, which are comparison-only — registered as a new
`ml_models` row via the backend (always `CANDIDATE` or `TEST_ONLY` status;
a model can never register itself as `ACTIVE`).

## Serving predictions

```bash
uvicorn app.main:app --port 8001
```

`GET /health` is open. `POST /predict` and `POST /predict/batch` require an
`Authorization: Bearer <ML_SERVICE_TOKEN>` header matching the backend's own
`ML_SERVICE_TOKEN`, and reject a `featureSchemaVersion` mismatch with a
controlled 409 rather than ever predicting on a possibly-incompatible
feature vector. This service is called by the backend's
`MlShadowPredictionService` after every startup score recalculation — it has
no other caller and is never reachable from the public API.

## Tests

```bash
pytest                                    # unit + component tests, no live backend needed
RUWAD_ML_E2E_TEST=1 pytest tests/test_e2e_synthetic.py -v   # opt-in, needs a running local backend + admin creds
```

## Layout

```
app/
  config.py, ruwad_client.py, ml_features.py, main.py
  api/          FastAPI routes (health, predict, models) + shared-secret auth
  training/     dataset loading, splitting, preprocessing, baselines,
                CatBoost/XGBoost/LightGBM, evaluation, calibration,
                explainability, comparison, and train.py (the CLI)
  inference/    model loader + predictor (schema-checked, allowlist-only)
  registry/     local artifact storage + NestJS registry reporting
  validation/   readiness gate, leakage assertions, data-quality checks
tests/          one test file per module above, plus fixtures/synthetic_dataset.py
                (TEST_ONLY — app/training/dataset.py never imports it)
```

## What this service will never do

- Train a real model on synthetic or insufficient data (the readiness gate
  is never bypassed for a real run).
- Register a model as anything other than `CANDIDATE`/`TEST_ONLY` — the
  backend's `MlModelRegistryService` derives status itself and enforces a
  status-transition guard where `TEST_ONLY` is terminal.
- Read or write Postgres directly — it only ever talks to the backend's
  admin HTTP API, the same as a human admin would.
- Read anything beyond `app/ml_features.py`'s allowlist from a prediction
  request, or accept an unauthenticated `/predict*` call.
