"""EXPERIMENTAL live inference — admin-internal, never a score.

Serves ONE explicitly requested model, and only if that model is registered as
EXPERIMENTAL in its artifact metadata (`is_experimental`): the production
`/predict` path and this one are separate, so an experimental model can never be
served as if it were a production one, and this endpoint can never serve a
production model. The response says, in every field that could be misread, that
it is an experimental estimate: reliability is never above LOW, calibration is
declared NOT_RELIABLE, and there is no fallback value — if the input is not good
enough the answer is INSUFFICIENT_DATA, never "50%".

Checks done here, because only this service knows the model's own inputs and
training distribution:
  * the request's feature schema matches the model's schema (else a controlled 409);
  * only the model's own feature columns are read (anything else is ignored);
  * values are finite and non-negative (counts); invalid values -> INSUFFICIENT_DATA;
  * a minimum number of the model's features must be populated;
  * every populated value is compared with the training range (a sidecar
    `training_profile.json` written from the frozen dataset: per-feature counts
    and min/max only, no rows).
"""
from __future__ import annotations

import math
import sys
import threading
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from .loader import LoadedModel, ModelLoader
from .predictor import ModelNotFoundError, SchemaMismatchError, _predict_raw

# The model was trained on very few rows: nothing here may ever read as strong.
MIN_POPULATED_FEATURES = 2
MAX_RELIABILITY = "LOW"
VERY_LOW_COMPLETENESS = 0.43  # fewer than 3 of the model's 7 features
CALIBRATION = "NOT_RELIABLE_AT_CURRENT_SAMPLE_SIZE"
EXPERIMENTAL_WARNING = "Experimental prediction. Not used in the RUWAD Score. Model trained on a limited historical dataset."


class NotExperimentalError(ValueError):
    def __init__(self, model_version: str):
        super().__init__(f'Model "{model_version}" is not an EXPERIMENTAL model; this endpoint only serves experimental models')


@dataclass
class ExperimentalResult:
    status: str  # OK | INSUFFICIENT_DATA
    model_version: str
    target: str
    target_version: str
    feature_schema_version: str
    prediction: float | None = None
    reliability: str | None = None
    reliability_reasons: list[str] = field(default_factory=list)
    feature_completeness: float = 0.0
    populated_features: list[str] = field(default_factory=list)
    missing_features: list[str] = field(default_factory=list)
    out_of_range: list[str] = field(default_factory=list)
    invalid_features: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    training_rows: int = 0
    training_positives: int | None = None
    training_negatives: int | None = None
    algorithm: str = ""
    dataset_version: str | None = None
    drivers: list[dict] = field(default_factory=list)
    drivers_note: str | None = None
    warnings: list[str] = field(default_factory=list)


def _is_valid_number(v: Any) -> bool:
    if isinstance(v, bool):
        return True
    return isinstance(v, (int, float)) and math.isfinite(float(v)) and float(v) >= 0


def classify_features(features: dict, feature_cols: list[str]) -> tuple[dict, list[str], list[str]]:
    """-> (valid populated values, missing columns, invalid columns). Reads ONLY the model's own columns."""
    valid: dict = {}
    missing: list[str] = []
    invalid: list[str] = []
    for col in feature_cols:
        v = features.get(col)
        if v is None:
            missing.append(col)
        elif _is_valid_number(v):
            valid[col] = float(v) if not isinstance(v, bool) else v
        else:
            invalid.append(col)
    return valid, missing, invalid


def out_of_range(valid: dict, profile: dict | None) -> list[str]:
    if not profile:
        return []
    flags: list[str] = []
    stats = profile.get("features", {})
    for col, v in valid.items():
        s = stats.get(col)
        if s is None or not s.get("count"):
            flags.append(f"{col}: never observed in the training data")
        elif isinstance(v, (int, float)) and not isinstance(v, bool) and (v < s["min"] or v > s["max"]):
            flags.append(f"{col}={v:g} is outside the training range {s['min']:g}-{s['max']:g}")
    return flags


def reliability_for(completeness: float, flags: list[str], has_profile: bool, training_rows: int) -> tuple[str, list[str]]:
    """Never above LOW. VERY_LOW when the input is thin, unfamiliar, or the training distribution is unknown."""
    reasons = [f"model trained on only {training_rows} examples (never rated above LOW)"]
    level = MAX_RELIABILITY
    if completeness < VERY_LOW_COMPLETENESS:
        level = "VERY_LOW"
        reasons.append(f"only {round(completeness * 100)}% of the model's features are populated")
    if flags:
        level = "VERY_LOW"
        reasons.append("input values fall outside what the model saw in training")
    if not has_profile:
        level = "VERY_LOW"
        reasons.append("no training-distribution profile is available for this model")
    return level, reasons


def _shap_ready() -> bool:
    return "shap" in sys.modules


def _import_shap() -> None:
    try:
        import shap  # noqa: F401 — the first import costs several seconds
    except Exception:  # noqa: BLE001
        pass


def warm_up(loader: ModelLoader) -> None:
    """Called once from a background thread at service start: load every local artifact and pay the one-off SHAP import cost, so the first
    real request is not slower than the backend's short timeout. Never raises and never blocks readiness."""
    try:
        for md in loader.list_available():
            loader.get(md.model_version)
    except Exception:  # noqa: BLE001
        pass
    _import_shap()


def _drivers(loaded: LoadedModel, df: pd.DataFrame, feature_cols: list[str]) -> tuple[list[dict], str | None]:
    """Exploratory per-feature contributions for tree models. Best effort: failure just omits them.

    The contributions are optional; the prediction is not. If SHAP has not been imported yet (cold process) they are skipped for this
    call rather than delaying the answer, and the import is started in the background."""
    if loaded.metadata.algorithm not in ("catboost", "xgboost", "lightgbm"):
        return [], "Contributions are only shown for tree models."
    if not _shap_ready():
        threading.Thread(target=_import_shap, daemon=True).start()
        return [], "Contributions are still warming up."
    try:
        import numpy as np
        import shap

        X = loaded.preprocessor.transform(df, feature_cols)
        if loaded.metadata.algorithm in ("xgboost", "lightgbm"):
            for col in getattr(loaded.preprocessor, "categorical_cols", []):
                if col in X.columns:
                    X[col] = X[col].astype("category")
        values = shap.TreeExplainer(loaded.estimator).shap_values(X)
        if isinstance(values, list):
            values = values[-1]
        arr = np.asarray(values)
        if arr.ndim == 3:
            arr = arr[:, :, -1]
        row = arr[0]
        ranked = sorted(zip(feature_cols, row.tolist()), key=lambda x: abs(x[1]), reverse=True)
        out = [{"feature": f, "contribution": round(float(c), 4), "direction": "UP" if c > 0 else "DOWN"} for f, c in ranked if abs(c) > 1e-9][:6]
        return out, "Exploratory model contribution, not a causal explanation. Rankings are unstable at this sample size."
    except Exception:  # noqa: BLE001 — enrichment only
        return [], "Contributions unavailable."


def predict_experimental(loader: ModelLoader, *, model_version: str, feature_schema_version: str, features: dict) -> ExperimentalResult:
    loaded = loader.get(model_version)
    if loaded is None:
        raise ModelNotFoundError(model_version)
    md = loaded.metadata
    if not md.is_experimental:
        raise NotExperimentalError(model_version)
    if md.feature_schema_version != feature_schema_version:
        raise SchemaMismatchError(md.feature_schema_version, feature_schema_version)

    profile = loader.profile(model_version)
    feature_cols = md.feature_cols
    valid, missing, invalid = classify_features(features, feature_cols)
    experimental_meta = (md.metrics or {}) if isinstance(md.metrics, dict) else {}
    positives = experimental_meta.get("positiveCount")
    negatives = experimental_meta.get("negativeCount")
    base = dict(
        model_version=md.model_version, target=md.target_name, target_version=md.target_version, feature_schema_version=md.feature_schema_version,
        feature_completeness=round(len(valid) / len(feature_cols), 3) if feature_cols else 0.0, populated_features=sorted(valid), missing_features=missing, invalid_features=invalid,
        training_rows=md.training_rows, training_positives=positives, training_negatives=negatives, algorithm=md.algorithm, dataset_version=experimental_meta.get("datasetVersion"),
        warnings=[EXPERIMENTAL_WARNING],
    )
    if invalid:
        return ExperimentalResult(status="INSUFFICIENT_DATA", reasons=[f"Invalid values (must be finite and non-negative): {', '.join(invalid)}"], **base)
    if len(valid) < MIN_POPULATED_FEATURES:
        return ExperimentalResult(status="INSUFFICIENT_DATA", reasons=[f"At least {MIN_POPULATED_FEATURES} of the model's {len(feature_cols)} features are required; {len(valid)} populated"], **base)

    df = pd.DataFrame([{c: valid.get(c) for c in feature_cols}])
    value = _predict_raw(loaded, df)
    flags = out_of_range(valid, profile)
    level, reasons = reliability_for(base["feature_completeness"], flags, profile is not None, md.training_rows)
    drivers, note = _drivers(loaded, df, feature_cols)
    return ExperimentalResult(status="OK", prediction=round(float(value), 6), reliability=level, reliability_reasons=reasons, out_of_range=flags, drivers=drivers, drivers_note=note, **base)
