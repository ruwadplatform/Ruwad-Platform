# RUWĀD ML Training Methodology

This document describes how RUWĀD trains, evaluates, registers, and shadow-deploys
machine-learning models (`ml/`), and — most importantly — the boundary between this
system and the public **RUWĀD Score**. It complements
[`docs/ml-data-methodology.md`](./ml-data-methodology.md), which covers where the
underlying features and labels come from.

## RUWĀD Score ≠ ML prediction

The public RUWĀD Score is, and remains, a deterministic weighted-rule score
(`backend/src/scoring/scoring.service.ts`, `ScoringService`). It is computed as
`RULE_WEIGHT * ruleScore + ML_WEIGHT * mlScore`, with `RULE_WEIGHT = 1` and
`ML_WEIGHT = 0` (`backend/src/scoring/scoring.constants.ts`) — unconditionally, not
behind a feature flag someone could flip to change scoring behavior. No model trained
by this framework changes what a founder, investor, or the public sees as a startup's
RUWĀD Score. A model's predictions are stored separately, in `ml_predictions`, as
**shadow predictions** — internal-only, for evaluating whether a model would have been
useful, never as an input to scoring.

## Targets

A "target" is a specific, time-bounded question about a startup — e.g. "will this
startup raise a new funding round within 12 months of this snapshot." Targets are
defined once, in `backend/src/ml-data/target-registry.ts`, which is also the single
source of truth for whether a target is a classification target (`valueType:
"boolean"`) or a regression target (`valueType: "numeric"`). Python never hardcodes
this — `app/training/target_types.py::fetch_target_meta()` reads it from
`GET /ml-data/targets` on every run.

## Readiness gate

A **real** training run always calls `GET /ml-data/readiness/:target` first
(`app/validation/readiness.py::require_ready()`) and refuses to train — printing the
exact reasons — if the dataset doesn't clear the backend's thresholds (minimum usable
examples, minimum examples per class, minimum feature coverage). This gate is never
bypassed for a real run. The only way to skip it is `--test-only`, which also switches
the dataset source to a synthetic, clearly-fake fixture and tags every resulting
artifact and database row `TEST_ONLY`.

## Data splitting — temporal + grouped

Ordinary random row splitting would leak: the same startup's snapshots would appear in
both train and test, letting a model partly memorize a startup's identity instead of
learning generalizable patterns, and later snapshots (which already "know" more) could
leak into training a model meant to predict the future from earlier information.

`app/training/splits.py::temporal_group_split()` instead:

1. Groups rows by `startupId`.
2. Sorts the groups by each group's *earliest* `snapshotAt` (its cohort date).
3. Walks the sorted groups, assigning each **entire** group to train, validation, or
   test by cumulative row-fraction against the requested `train_frac`/`val_frac`
   (defaults 70% / 15% / 15%).

This guarantees a startup's rows never span more than one split
(`app/validation/leakage.py::assert_no_group_leakage()`), and that later time periods
land in validation/test, never in training
(`assert_temporal_order()`, checked on split medians). With RUWĀD's current dataset
size, validation and test can legitimately be empty for a very small candidate set —
the function never fabricates rows to avoid this; the caller (readiness / training)
decides whether that's acceptable.

## Preprocessing

Two paths, fit only on the training split and saved with every artifact:

- **Native** (CatBoost, XGBoost): missing values stay `NaN`, `regulatoryMilestone`
  stays a real categorical value. `patentsGranted = null` is never silently coerced to
  `patentsGranted = 0` — a missing value and a genuine zero are different facts.
- **Imputed** (the sklearn baselines, which cannot accept `NaN`): numeric columns get a
  median-imputed value **plus** a `<col>_missing` indicator column, so "reported as
  low" and "not reported" stay distinguishable even after imputation. The categorical
  column is one-hot encoded with an explicit missing bucket.

## Baselines — trained and reported before any boosting model

Before CatBoost or XGBoost, `app/training/baselines.py` trains: a majority-class /
prior baseline and a class-weighted logistic regression (classification), or a
median-prediction baseline and a ridge regression (regression). A complex model is
expected to demonstrate real improvement over these — a boosted model that barely beats
majority-class is not, on its own, a reason to promote it.

## Algorithms

- **CatBoost** (`catboost_model.py`) — the primary candidate. Native missing-value and
  categorical handling, class weights derived from the *actual* training split's class
  balance (never a blind default), fixed/constrained hyperparameters
  (`iterations=300, depth=6, learning_rate=0.05`, early stopping on validation AUC/RMSE)
  — no large hyperparameter search.
- **XGBoost** (`xgboost_model.py`) — second candidate, `enable_categorical=True`
  (native categorical support, no manual encoding), `scale_pos_weight` from the same
  train-split class balance.
- **LightGBM** (`lightgbm_model.py`) — optional third candidate. Not installed by
  default (`requirements-optional.txt`); guarded behind a typed
  `LightGBMNotAvailableError` if requested without being installed.

## Evaluation — never accuracy alone

`app/training/evaluate.py` reports, for classification: ROC-AUC, PR-AUC, log loss,
Brier score, precision/recall/F1 at a 0.5 threshold, the full confusion matrix, and the
positive rate (so a reviewer can see class imbalance directly). For regression: MAE,
RMSE, R², and median absolute error. Accuracy on its own is never reported as if it were
sufficient — for an imbalanced target, a model that always predicts "no" can have high
accuracy and be useless.

## Calibration

`app/training/calibrate.py::fit_calibration()` fits an isotonic or sigmoid calibrator
**only on the validation split, never on test** — test exists purely to report how good
the final, calibrated model is, uncontaminated by anything used to build it. Expected
Calibration Error (ECE, 10-bin) is reported before and after, so "this model's 70% is
actually about 70%" has a real number behind it, not just an assertion.

## Explainability

`app/training/explain.py::explain_tree_model()` uses SHAP's `TreeExplainer` to compute
global mean(|SHAP|) feature contributions for CatBoost/XGBoost/LightGBM models. This is
explicitly **admin/internal enrichment, not a required output or a causal claim** — if
SHAP fails for any reason, training continues and the explanation is simply marked
unavailable with a reason, never fails the whole run.

## Model registry and the promotion process

A trained (non-baseline) model is saved locally
(`ml/artifacts/<modelVersion>/{estimator,preprocessor}.joblib` +
`metadata.json`, via `app/registry/artifact_store.py`) and reported to the backend's
`ml_models` table (`POST /ml-data/models`). **The backend, not Python, is the sole
authority on a model's status.** `MlModelRegistryService.register()` always derives the
initial status from `isTestOnly` — `TEST_ONLY` or `CANDIDATE` — ignoring anything a
caller might otherwise send; a model can never register itself as anything more
advanced.

Status transitions are guarded (`MlModelRegistryService`'s `VALID_TRANSITIONS`):

```
TEST_ONLY → (terminal — can never become anything else)
CANDIDATE → SHADOW | REJECTED
SHADOW    → ACTIVE | RETIRED | REJECTED
ACTIVE    → RETIRED
RETIRED / REJECTED → (terminal)
```

Every transition past `CANDIDATE` is a **human admin decision**, made in the admin UI
(`/admin/ml-models`), informed by discrimination, calibration, stability, and data size
together. There is no automatic promotion path anywhere in this codebase — training
never sets a model to `SHADOW` or `ACTIVE`, and no code path picks "the winner" from a
comparison table and promotes it automatically.

Even at `ACTIVE`, a model does not affect the public RUWĀD Score — see the top of this
document. `ACTIVE`/`SHADOW` is what makes a model *eligible* for shadow predictions
(`MlModelRegistryService.findEligibleForShadowPrediction()`), nothing more.

## Shadow mode

After every startup score recalculation, if `ML_SCORING_ENABLED=true` and a feature
snapshot was taken, `MlShadowPredictionService.generateShadowPredictions()` runs
best-effort (try/catch, logged, never throrws) in `ScoringService.recalculateStartupScore()`,
*after* the rule-based `result` (and therefore `ruwadScore`) has already been computed
and is never touched by this step. It asks the backend's own `ml_models` table which
model versions are currently `SHADOW`/`ACTIVE` for any target, calls the Python
service's `POST /predict/batch` once with the snapshot's feature vector against all of
them, and stores each prediction in `ml_predictions` for later evaluation. If the
Python service is unreachable, slow, or errors, shadow-prediction generation is simply
skipped for that recalculation — normal scoring is never affected.

An admin-triggered (never automatic) evaluation pass
(`MlShadowPredictionService.evaluateMaturedPredictions()`) backfills `actualOutcome` /
`evaluatedAt` on any stored prediction whose target has since matured, using the exact
same label-calculation logic as the real target definitions
(`target-registry.ts`), so "was this shadow prediction right" is answerable — this table
is also the "enough data stored for later" this project needs before it would ever
consider building active drift monitoring, which does not exist yet.

## Security

- **Python → NestJS**: the training CLI logs in once with an admin account and reuses
  the resulting JWT — the same Bearer-token path NestJS's `JwtStrategy` already
  supports for API-testing tools.
- **NestJS → Python**: a shared secret, `ML_SERVICE_TOKEN`, compared with a
  constant-time comparison on both sides (mirrors `content-refresh.controller.ts`'s
  existing pattern). Unset on either side means the Python service rejects everything
  (`503`), never silently accepting unauthenticated prediction traffic.
- **Feature allowlist**: a prediction request's `features` is read only through
  `ML_FEATURES_V1` (`app/ml_features.py`, mirroring the backend's own export
  allowlist) — no founder PII, documents, or NDA/Data Room content can reach a model
  even if a caller sent it.
- **Feature-schema-version check**: a request whose `featureSchemaVersion` doesn't
  match the loaded model's is rejected with a `409`, never silently predicted on.

## Limitations, honestly

- With RUWĀD's real dataset at its current size, the readiness gate is expected to
  block real training for a while yet — this is intended behavior, not a bug to work
  around.
- No active drift-monitoring job exists. `ml_predictions`'s stored `predictedAt` /
  `actualOutcome` / `evaluatedAt` fields, plus the existing data-quality/coverage
  reporting from Phase 1C, are what this project has today; a monitoring job is future
  work, not part of this framework.
- SHAP explanations are contributions, not causal claims, and are never surfaced
  outside the admin UI.
