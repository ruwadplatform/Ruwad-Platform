"""Deterministic preprocessing — fit ONLY on the training split, saved with
every model artifact so inference can reproduce it exactly.

Two paths, because CatBoost/XGBoost and the sklearn baselines want
genuinely different things:

  - "native": missing values stay NaN, `regulatoryMilestone` stays a
    string/category — CatBoost and XGBoost both handle missing values and
    (CatBoost natively, XGBoost via ordinal-encoding here) categorical
    features without a model being told a missing value IS a particular
    number. `patentsGranted = null` is never silently turned into
    `patentsGranted = 0` on this path.
  - "imputed": the sklearn baselines (LogisticRegression/Ridge) can't
    accept NaN at all, so numeric columns get a median-imputed value PLUS a
    same-named `<col>_missing` indicator column (0/1) so the model can
    still tell "reported as low" from "not reported" instead of the two
    being indistinguishable after imputation. The categorical column is
    one-hot encoded with an explicit "missing"/unknown-category bucket.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..ml_features import BOOLEAN_FEATURES, CATEGORICAL_FEATURES, NUMERIC_FEATURES


@dataclass
class NativePreprocessor:
    """No fitting needed beyond recording which columns are categorical —
    CatBoost/XGBoost consume the frame close to as-is."""

    categorical_cols: list[str] = field(default_factory=lambda: list(CATEGORICAL_FEATURES))
    boolean_cols: list[str] = field(default_factory=lambda: list(BOOLEAN_FEATURES))
    numeric_cols: list[str] = field(default_factory=lambda: list(NUMERIC_FEATURES))

    def transform(self, df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
        out = df.copy()
        for col in feature_cols:
            if col in self.categorical_cols:
                out[col] = out[col].astype("string").fillna("__missing__")
            elif col in self.boolean_cols:
                # Kept as a nullable float (0.0/1.0/NaN) rather than a
                # Python bool object column — both CatBoost and XGBoost
                # expect numeric dtypes for non-declared-categorical columns.
                out[col] = out[col].map({True: 1.0, False: 0.0, "true": 1.0, "false": 0.0}).astype("float64")
            else:
                out[col] = pd.to_numeric(out[col], errors="coerce")
        return out[feature_cols]

    def to_dict(self) -> dict:
        return {"kind": "native", "categorical_cols": self.categorical_cols, "boolean_cols": self.boolean_cols, "numeric_cols": self.numeric_cols}


@dataclass
class ImputedPreprocessor:
    """Fit on train only. `medians`/`category_values` are learned; applying
    to val/test/inference-time data never re-fits."""

    medians: dict[str, float] = field(default_factory=dict)
    category_values: list[str] = field(default_factory=list)
    fitted: bool = False

    def fit(self, df: pd.DataFrame, feature_cols: list[str]) -> "ImputedPreprocessor":
        for col in NUMERIC_FEATURES + BOOLEAN_FEATURES:
            if col in feature_cols:
                numeric = pd.to_numeric(df[col], errors="coerce")
                self.medians[col] = float(numeric.median()) if numeric.notna().any() else 0.0
        if CATEGORICAL_FEATURES[0] in feature_cols:
            values = df[CATEGORICAL_FEATURES[0]].dropna().astype(str).unique().tolist()
            self.category_values = sorted(values)
        self.fitted = True
        return self

    def transform(self, df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
        if not self.fitted:
            raise RuntimeError("ImputedPreprocessor.transform() called before fit()")
        out = pd.DataFrame(index=df.index)
        for col in feature_cols:
            if col in CATEGORICAL_FEATURES:
                continue  # handled by one-hot block below
            raw = df[col].map({True: 1.0, False: 0.0}) if col in BOOLEAN_FEATURES else df[col]
            numeric = pd.to_numeric(raw, errors="coerce")
            missing = numeric.isna()
            out[col] = numeric.fillna(self.medians.get(col, 0.0))
            out[f"{col}_missing"] = missing.astype(int)

        if CATEGORICAL_FEATURES[0] in feature_cols:
            cat_col = CATEGORICAL_FEATURES[0]
            raw_cat = df[cat_col].astype("string")
            for value in self.category_values:
                # `raw_cat == value` is a nullable pandas "boolean" comparison
                # (three-valued logic): a missing category value compares to
                # <NA>, not False. fillna(False) is required before .astype(int)
                # — the row's "is missing" fact is captured separately below.
                out[f"{cat_col}__{value}"] = (raw_cat == value).fillna(False).astype(int)
            out[f"{cat_col}__missing"] = raw_cat.isna().astype(int)

        return out.astype(float)

    def to_dict(self) -> dict:
        return {"kind": "imputed", "medians": self.medians, "category_values": self.category_values}


def native_preprocessor() -> NativePreprocessor:
    return NativePreprocessor()


def fit_imputed_preprocessor(train_df: pd.DataFrame, feature_cols: list[str]) -> ImputedPreprocessor:
    return ImputedPreprocessor().fit(train_df, feature_cols)


def preprocessor_from_dict(payload: dict) -> NativePreprocessor | ImputedPreprocessor:
    if payload["kind"] == "native":
        return NativePreprocessor(categorical_cols=payload["categorical_cols"], boolean_cols=payload["boolean_cols"], numeric_cols=payload["numeric_cols"])
    p = ImputedPreprocessor(medians=payload["medians"], category_values=payload["category_values"], fitted=True)
    return p


def infinities_to_nan(df: pd.DataFrame) -> pd.DataFrame:
    """Extreme values are preserved (never clipped silently) but +/-inf,
    which no model here can handle, is converted to NaN — treated exactly
    like any other missing value by the paths above."""
    return df.replace([np.inf, -np.inf], np.nan)
