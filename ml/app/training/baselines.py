"""Simple baselines, trained and reported BEFORE any gradient-boosting
model — a complex model must demonstrate real improvement over these, per
docs/ml-training-methodology.md. Both use the imputed preprocessing path
(sklearn can't accept NaN).
"""
from __future__ import annotations

import pandas as pd
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.linear_model import LogisticRegression, Ridge

from .model_types import TrainedModel
from .preprocessing import fit_imputed_preprocessor
from .target_types import TargetType


def train_majority_class_baseline(train_df: pd.DataFrame, feature_cols: list[str], target_col: str) -> TrainedModel:
    pre = fit_imputed_preprocessor(train_df, feature_cols)
    X = pre.transform(train_df, feature_cols)
    y = train_df[target_col].to_numpy()
    clf = DummyClassifier(strategy="prior")
    clf.fit(X, y)

    def predict_fn(estimator, X_):
        return estimator.predict_proba(X_)[:, 1]

    return TrainedModel(algorithm="baseline-majority-class", target_type=TargetType.CLASSIFICATION, estimator=clf, preprocessor=pre, feature_cols=feature_cols, hyperparameters={"strategy": "prior"}, predict_fn=predict_fn)


def train_logistic_regression_baseline(train_df: pd.DataFrame, feature_cols: list[str], target_col: str, *, random_seed: int = 42) -> TrainedModel:
    pre = fit_imputed_preprocessor(train_df, feature_cols)
    X = pre.transform(train_df, feature_cols)
    y = train_df[target_col].to_numpy()
    hyperparameters = {"class_weight": "balanced", "max_iter": 1000, "random_state": random_seed}
    clf = LogisticRegression(**hyperparameters)
    clf.fit(X, y)

    def predict_fn(estimator, X_):
        return estimator.predict_proba(X_)[:, 1]

    return TrainedModel(algorithm="baseline-logistic-regression", target_type=TargetType.CLASSIFICATION, estimator=clf, preprocessor=pre, feature_cols=feature_cols, hyperparameters=hyperparameters, predict_fn=predict_fn)


def train_mean_median_baseline(train_df: pd.DataFrame, feature_cols: list[str], target_col: str, *, strategy: str = "median") -> TrainedModel:
    pre = fit_imputed_preprocessor(train_df, feature_cols)
    X = pre.transform(train_df, feature_cols)
    y = train_df[target_col].to_numpy()
    reg = DummyRegressor(strategy=strategy)
    reg.fit(X, y)

    def predict_fn(estimator, X_):
        return estimator.predict(X_)

    return TrainedModel(algorithm=f"baseline-{strategy}", target_type=TargetType.REGRESSION, estimator=reg, preprocessor=pre, feature_cols=feature_cols, hyperparameters={"strategy": strategy}, predict_fn=predict_fn)


def train_ridge_baseline(train_df: pd.DataFrame, feature_cols: list[str], target_col: str, *, random_seed: int = 42) -> TrainedModel:
    pre = fit_imputed_preprocessor(train_df, feature_cols)
    X = pre.transform(train_df, feature_cols)
    y = train_df[target_col].to_numpy()
    hyperparameters = {"alpha": 1.0, "random_state": random_seed}
    reg = Ridge(**hyperparameters)
    reg.fit(X, y)

    def predict_fn(estimator, X_):
        return estimator.predict(X_)

    return TrainedModel(algorithm="baseline-ridge", target_type=TargetType.REGRESSION, estimator=reg, preprocessor=pre, feature_cols=feature_cols, hyperparameters=hyperparameters, predict_fn=predict_fn)


def train_baselines(train_df: pd.DataFrame, feature_cols: list[str], target_col: str, target_type: TargetType, *, random_seed: int = 42) -> list[TrainedModel]:
    if target_type is TargetType.CLASSIFICATION:
        return [train_majority_class_baseline(train_df, feature_cols, target_col), train_logistic_regression_baseline(train_df, feature_cols, target_col, random_seed=random_seed)]
    return [train_mean_median_baseline(train_df, feature_cols, target_col), train_ridge_baseline(train_df, feature_cols, target_col, random_seed=random_seed)]
