"""SHAP explainability — admin/internal only, never exposed publicly (see
docs/ml-training-methodology.md). Produces model CONTRIBUTIONS, phrased as
such, never as causal claims. Guarded: if SHAP fails for any reason (a
model type it doesn't support well, a version mismatch), explanation is
skipped with a warning rather than failing the whole training run — this
is enrichment, not a required output.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .model_types import TrainedModel


@dataclass
class ExplainabilityResult:
    global_importance: list[dict]  # [{feature, meanAbsShap}], sorted descending
    available: bool
    reason: str | None = None

    def to_dict(self) -> dict:
        return {"globalImportance": self.global_importance, "available": self.available, "reason": self.reason}


def explain_tree_model(model: TrainedModel, sample_df: pd.DataFrame, *, max_rows: int = 200) -> ExplainabilityResult:
    if model.algorithm not in ("catboost", "xgboost", "lightgbm"):
        return ExplainabilityResult(global_importance=[], available=False, reason=f"SHAP explanation only implemented for tree models, got '{model.algorithm}'")

    try:
        import shap  # local import — this whole module degrades gracefully if the package has an issue

        X = model.preprocessor.transform(sample_df, model.feature_cols)
        if model.algorithm == "xgboost":
            for col in getattr(model.preprocessor, "categorical_cols", []):
                if col in X.columns:
                    X[col] = X[col].astype("category")
        X_sample = X.iloc[:max_rows]

        explainer = shap.TreeExplainer(model.estimator)
        shap_values = explainer.shap_values(X_sample)
        if isinstance(shap_values, list):  # some classifier explainers return [class0, class1]
            shap_values = shap_values[-1]
        shap_values = np.asarray(shap_values)
        if shap_values.ndim == 3:  # (n, features, classes) for some versions
            shap_values = shap_values[:, :, -1]

        mean_abs = np.abs(shap_values).mean(axis=0)
        ranked = sorted(zip(model.feature_cols, mean_abs.tolist()), key=lambda x: x[1], reverse=True)
        return ExplainabilityResult(global_importance=[{"feature": f, "meanAbsShap": round(v, 6)} for f, v in ranked], available=True)
    except Exception as e:  # noqa: BLE001 — explicitly best-effort, see module docstring
        return ExplainabilityResult(global_importance=[], available=False, reason=str(e)[:300])
