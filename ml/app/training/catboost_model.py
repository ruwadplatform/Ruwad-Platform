"""CatBoost — the primary candidate: native missing-value handling, native
categorical support (no one-hot needed for `regulatoryMilestone`), and
good behavior on small/medium tabular datasets, which is exactly RUWĀD's
shape for a long while yet. Deliberately constrained hyperparameters — no
large search, per docs/ml-training-methodology.md.
"""
from __future__ import annotations

import pandas as pd
from catboost import CatBoostClassifier, CatBoostRegressor

from .model_types import TrainedModel
from .preprocessing import native_preprocessor
from .target_types import TargetType

DEFAULT_PARAMS = {
    "iterations": 300,
    "depth": 6,
    "learning_rate": 0.05,
    "early_stopping_rounds": 30,
    "verbose": False,
    # Without this, CatBoost writes a catboost_info/ directory of training
    # logs into the current working directory on every run — caught by
    # manual verification leaving one behind in ml/ instead of a temp dir.
    "allow_writing_files": False,
}


def _class_weights(y: pd.Series) -> list[float]:
    positive_rate = float(y.mean()) if len(y) else 0.5
    positive_rate = min(max(positive_rate, 1e-3), 1 - 1e-3)
    # class 0 weight, class 1 weight — inverse of each class's frequency,
    # normalized so the majority class keeps weight 1.
    return [1.0, (1 - positive_rate) / positive_rate] if positive_rate < 0.5 else [positive_rate / (1 - positive_rate), 1.0]


def train_catboost(
    train_df: pd.DataFrame, val_df: pd.DataFrame, feature_cols: list[str], target_col: str, target_type: TargetType,
    *, random_seed: int = 42, params: dict | None = None,
) -> TrainedModel:
    pre = native_preprocessor()
    X_train = pre.transform(train_df, feature_cols)
    y_train = train_df[target_col]
    X_val = pre.transform(val_df, feature_cols) if len(val_df) else None
    y_val = val_df[target_col] if len(val_df) else None

    cat_idx = [feature_cols.index(c) for c in pre.categorical_cols if c in feature_cols]
    hyperparameters = {**DEFAULT_PARAMS, **(params or {}), "random_seed": random_seed, "cat_features": cat_idx}

    if target_type is TargetType.CLASSIFICATION:
        hp = {**hyperparameters, "loss_function": "Logloss", "eval_metric": "AUC", "class_weights": _class_weights(y_train)}
        model = CatBoostClassifier(**hp)
    else:
        hp = {**hyperparameters, "loss_function": "RMSE", "eval_metric": "RMSE"}
        model = CatBoostRegressor(**hp)

    fit_kwargs = {"eval_set": (X_val, y_val)} if X_val is not None and len(X_val) else {}
    model.fit(X_train, y_train, **fit_kwargs)

    def predict_fn(estimator, X_):
        if target_type is TargetType.CLASSIFICATION:
            return estimator.predict_proba(X_)[:, 1]
        return estimator.predict(X_)

    return TrainedModel(algorithm="catboost", target_type=target_type, estimator=model, preprocessor=pre, feature_cols=feature_cols, hyperparameters=hp, predict_fn=predict_fn)
