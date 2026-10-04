"""Lightweight, defensive checks on a fetched training dataframe — mostly
redundant with the backend's own MlDataQualityService (which already
flagged these at the source), but cheap insurance right before training
commits to a dataset shape.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


class DataQualityError(ValueError):
    pass


def validate_dataset(df: pd.DataFrame, target_col: str, id_cols: tuple[str, ...] = ("startupId", "snapshotId")) -> list[str]:
    """Returns a list of warnings (never raises) for non-fatal issues, but
    raises DataQualityError for anything that would make training
    meaningless (empty dataset, missing target column, duplicate rows)."""
    warnings: list[str] = []

    if df.empty:
        raise DataQualityError("Dataset is empty — nothing to train on")
    if target_col not in df.columns:
        raise DataQualityError(f"Target column '{target_col}' missing from the fetched dataset")
    if df[target_col].isna().any():
        raise DataQualityError(f"Target column '{target_col}' has missing values — the export should only ever return AVAILABLE-status rows")

    for id_col in id_cols:
        if id_col in df.columns and df[id_col].duplicated().any():
            warnings.append(f"Duplicate values found in '{id_col}' — expected one row per snapshot")

    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        if np.isinf(df[col].to_numpy(dtype=float, na_value=0.0)).any():
            warnings.append(f"Column '{col}' contains an infinite value")

    return warnings
