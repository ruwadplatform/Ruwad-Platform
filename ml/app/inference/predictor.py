"""Turns one PredictRequest into one PredictResponse — the only place that
actually calls a loaded estimator. Rejects a featureSchemaVersion mismatch
with a controlled error rather than ever silently predicting on a
possibly-incompatible feature vector (see SchemaMismatchError below).
"""
from __future__ import annotations

import pandas as pd

from ..ml_features import ML_FEATURES_V1
from .loader import LoadedModel, ModelLoader
from .schemas import PredictRequest, PredictResponse


class SchemaMismatchError(ValueError):
    def __init__(self, expected: str, got: str):
        self.expected = expected
        self.got = got
        super().__init__(f'Feature schema mismatch: model expects "{expected}", request has "{got}"')


class ExperimentalModelNotServedError(ValueError):
    """Experimental models are served ONLY by /predict/experimental (admin-internal, with its own gates), never by the generic /predict paths."""

    def __init__(self, model_version: str):
        super().__init__(f'Model "{model_version}" is EXPERIMENTAL and can only be served by /predict/experimental')


class ModelNotFoundError(ValueError):
    def __init__(self, model_version: str):
        super().__init__(f'Unknown model version "{model_version}"')


def _row_from_request(request: PredictRequest) -> pd.DataFrame:
    # Only allowlisted keys are ever read — anything else the caller sent
    # (there shouldn't be anything else, since NestJS's own export already
    # only ever sends allowlisted columns) is silently ignored, never
    # passed through to the model.
    row = {k: request.features.get(k) for k in ML_FEATURES_V1}
    return pd.DataFrame([row])


def _predict_raw(loaded: LoadedModel, df: pd.DataFrame) -> float:
    feature_cols = loaded.metadata.feature_cols or list(df.columns)
    X = loaded.preprocessor.transform(df, feature_cols)

    if loaded.metadata.algorithm in ("xgboost", "lightgbm"):
        for col in getattr(loaded.preprocessor, "categorical_cols", []):
            if col in X.columns:
                X[col] = X[col].astype("category")

    estimator = loaded.estimator
    if loaded.metadata.prediction_type == "PROBABILITY" and hasattr(estimator, "predict_proba"):
        return float(estimator.predict_proba(X)[:, 1][0])
    return float(estimator.predict(X)[0])


def predict_one(loader: ModelLoader, request: PredictRequest) -> PredictResponse:
    loaded = loader.get(request.modelVersion)
    if loaded is None:
        raise ModelNotFoundError(request.modelVersion)
    if loaded.metadata.is_experimental:
        raise ExperimentalModelNotServedError(request.modelVersion)
    if loaded.metadata.feature_schema_version != request.featureSchemaVersion:
        raise SchemaMismatchError(loaded.metadata.feature_schema_version, request.featureSchemaVersion)

    df = _row_from_request(request)
    value = _predict_raw(loaded, df)

    return PredictResponse(
        target=loaded.metadata.target_name, targetVersion=loaded.metadata.target_version, modelVersion=loaded.metadata.model_version,
        prediction=round(value, 6), predictionType=loaded.metadata.prediction_type,  # type: ignore[arg-type]
        modelStatus="TEST_ONLY" if loaded.metadata.is_test_only else "UNKNOWN",  # informational only — see predictor's own doc comment
        featureSchemaVersion=loaded.metadata.feature_schema_version,
    )
