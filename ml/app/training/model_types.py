"""Shared result container every trainer (baselines/CatBoost/XGBoost/
LightGBM) returns — gives evaluate.py/calibrate.py/explain.py/compare.py
one consistent shape to work with regardless of which library actually
produced the fitted estimator.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import numpy as np
import pandas as pd

from .target_types import TargetType


@dataclass
class TrainedModel:
    algorithm: str
    target_type: TargetType
    estimator: Any
    preprocessor: Any
    feature_cols: list[str]
    hyperparameters: dict
    # (estimator, X_transformed) -> 1D array: probabilities in [0,1] for
    # classification, raw values for regression. Kept as an explicit
    # function (not a method) so the same TrainedModel shape works for
    # sklearn/CatBoost/XGBoost estimators, whose predict APIs all differ.
    predict_fn: Callable[[Any, pd.DataFrame], np.ndarray]

    def predict(self, df_raw: pd.DataFrame) -> np.ndarray:
        X = self.preprocessor.transform(df_raw, self.feature_cols)
        return self.predict_fn(self.estimator, X)
