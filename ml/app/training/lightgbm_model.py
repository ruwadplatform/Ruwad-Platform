"""LightGBM — optional third gradient-boosting candidate. NOT installed by
default (see ../../requirements-optional.txt) — CatBoost + XGBoost already
cover this project's "tabular, missing values, categorical, nonlinear
interactions" needs, and adding a third native-build dependency isn't
worth compromising the rest of the service for. Guarded entirely behind a
try/except import: if lightgbm isn't installed, `train_lightgbm()` raises
a clear, typed error rather than crashing the whole training CLI.
"""
from __future__ import annotations

import pandas as pd

from .model_types import TrainedModel
from .preprocessing import native_preprocessor
from .target_types import TargetType

try:
    from lightgbm import LGBMClassifier, LGBMRegressor
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False


class LightGBMNotAvailableError(RuntimeError):
    def __init__(self):
        super().__init__('lightgbm is not installed — run "pip install -r requirements-optional.txt" first, or drop lightgbm from --algorithms.')


DEFAULT_PARAMS = {"n_estimators": 300, "num_leaves": 31, "learning_rate": 0.05, "subsample": 0.9, "colsample_bytree": 0.9}


def train_lightgbm(
    train_df: pd.DataFrame, val_df: pd.DataFrame, feature_cols: list[str], target_col: str, target_type: TargetType,
    *, random_seed: int = 42, params: dict | None = None,
) -> TrainedModel:
    if not LIGHTGBM_AVAILABLE:
        raise LightGBMNotAvailableError()

    pre = native_preprocessor()
    X_train = pre.transform(train_df, feature_cols)
    for col in pre.categorical_cols:
        if col in X_train.columns:
            X_train[col] = X_train[col].astype("category")
    y_train = train_df[target_col]

    hyperparameters = {**DEFAULT_PARAMS, **(params or {}), "random_state": random_seed}

    if target_type is TargetType.CLASSIFICATION:
        hp = {**hyperparameters, "objective": "binary", "class_weight": "balanced"}
        model = LGBMClassifier(**hp)
    else:
        hp = {**hyperparameters, "objective": "regression"}
        model = LGBMRegressor(**hp)

    model.fit(X_train, y_train, categorical_feature=[c for c in pre.categorical_cols if c in feature_cols])

    def predict_fn(estimator, X_):
        X_cat = X_.copy()
        for col in pre.categorical_cols:
            if col in X_cat.columns:
                X_cat[col] = X_cat[col].astype("category")
        if target_type is TargetType.CLASSIFICATION:
            return estimator.predict_proba(X_cat)[:, 1]
        return estimator.predict(X_cat)

    return TrainedModel(algorithm="lightgbm", target_type=target_type, estimator=model, preprocessor=pre, feature_cols=feature_cols, hyperparameters=hp, predict_fn=predict_fn)
