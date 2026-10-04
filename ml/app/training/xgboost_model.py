"""XGBoost — second gradient-boosting candidate. Uses its native
`enable_categorical=True` support (xgboost>=2.0) so `regulatoryMilestone`
stays a real categorical column (no manual one-hot/ordinal encoding needed)
and missing numeric values stay NaN, handled internally exactly like
CatBoost's own missing-value handling.
"""
from __future__ import annotations

import pandas as pd
from xgboost import XGBClassifier, XGBRegressor

from .model_types import TrainedModel
from .preprocessing import native_preprocessor
from .target_types import TargetType

DEFAULT_PARAMS = {
    "n_estimators": 300,
    "max_depth": 5,
    "learning_rate": 0.05,
    "subsample": 0.9,
    "colsample_bytree": 0.9,
    "early_stopping_rounds": 30,
    "enable_categorical": True,
    "tree_method": "hist",
}


def _to_xgb_frame(df: pd.DataFrame, categorical_cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for col in categorical_cols:
        if col in out.columns:
            out[col] = out[col].astype("category")
    return out


def _scale_pos_weight(y: pd.Series) -> float:
    positives = float((y == 1).sum())
    negatives = float((y == 0).sum())
    return (negatives / positives) if positives > 0 else 1.0


def train_xgboost(
    train_df: pd.DataFrame, val_df: pd.DataFrame, feature_cols: list[str], target_col: str, target_type: TargetType,
    *, random_seed: int = 42, params: dict | None = None,
) -> TrainedModel:
    pre = native_preprocessor()
    X_train = _to_xgb_frame(pre.transform(train_df, feature_cols), pre.categorical_cols)
    y_train = train_df[target_col]
    has_val = len(val_df) > 0
    X_val = _to_xgb_frame(pre.transform(val_df, feature_cols), pre.categorical_cols) if has_val else None
    y_val = val_df[target_col] if has_val else None

    hyperparameters = {**DEFAULT_PARAMS, **(params or {}), "random_state": random_seed}
    if not has_val:
        hyperparameters.pop("early_stopping_rounds", None)

    if target_type is TargetType.CLASSIFICATION:
        hp = {**hyperparameters, "objective": "binary:logistic", "eval_metric": "auc", "scale_pos_weight": _scale_pos_weight(y_train)}
        model = XGBClassifier(**hp)
    else:
        hp = {**hyperparameters, "objective": "reg:squarederror", "eval_metric": "rmse"}
        model = XGBRegressor(**hp)

    fit_kwargs = {"eval_set": [(X_val, y_val)], "verbose": False} if has_val else {}
    model.fit(X_train, y_train, **fit_kwargs)

    def predict_fn(estimator, X_):
        X_cat = _to_xgb_frame(X_, pre.categorical_cols)
        if target_type is TargetType.CLASSIFICATION:
            return estimator.predict_proba(X_cat)[:, 1]
        return estimator.predict(X_cat)

    return TrainedModel(algorithm="xgboost", target_type=target_type, estimator=model, preprocessor=pre, feature_cols=feature_cols, hyperparameters=hp, predict_fn=predict_fn)
