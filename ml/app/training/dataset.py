"""Real dataset loader — pulls from the backend's existing, leakage-safe
GET /ml-data/export endpoint (built in Phase 1C) and does nothing else to
the rows. This module has NO synthetic-data code path at all: a TEST_ONLY
run gets its rows from tests/fixtures/synthetic_dataset.py instead, called
directly by train.py's CLI, never through this file — so "real dataset
loading" and "synthetic fixture" can never be accidentally confused at the
type level.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ..ml_features import ML_FEATURES_V1
from ..ruwad_client import RuwadClient
from ..validation.data_quality import validate_dataset
from .target_types import TargetMeta, TargetType


@dataclass
class Dataset:
    df: pd.DataFrame
    feature_cols: list[str]
    target_col: str
    target_meta: TargetMeta
    warnings: list[str]


def load_dataset(client: RuwadClient, target_meta: TargetMeta, *, min_confidence: float | None = None, verified_only: bool = False) -> Dataset:
    rows = client.fetch_export(target_meta.name, min_confidence=min_confidence, verified_only=verified_only, include_identifiers=True)
    df = pd.DataFrame(rows)
    target_col = f"target_{target_meta.name}"

    # Checked before anything else touches df[target_col] below — an empty
    # export or a missing target column would otherwise raise a raw
    # KeyError instead of this clear, typed error.
    if df.empty or target_col not in df.columns:
        from ..validation.data_quality import DataQualityError

        raise DataQualityError("Dataset is empty — nothing to train on" if df.empty else f"Target column '{target_col}' missing from the fetched dataset")

    # Defence in depth behind the export default: a REAL training set contains training-ELIGIBLE snapshots
    # only. Outcome-aware (legacy) / analysis-only rows are never trained on, even if an export option or an
    # older backend let one through; an export that does not say what each row is gets refused outright.
    if "trainingEligibility" not in df.columns:
        from ..validation.data_quality import DataQualityError

        raise DataQualityError("The export has no trainingEligibility column, so analysis-only (outcome-aware) rows cannot be ruled out")
    df = df[df["trainingEligibility"] == "ELIGIBLE"].reset_index(drop=True)
    if df.empty:
        from ..validation.data_quality import DataQualityError

        raise DataQualityError("No training-ELIGIBLE rows in the export — nothing to train on")

    status_col = f"{target_col}_status"
    if status_col in df.columns:
        # Defensive: the export already defaults to AVAILABLE-only rows,
        # but a caller-supplied includeImmature filter upstream could in
        # principle slip an immature row through — never train on one.
        df = df[df[status_col] == "AVAILABLE"].reset_index(drop=True)

    if target_meta.target_type is TargetType.CLASSIFICATION:
        df[target_col] = df[target_col].astype(bool).astype(int)
    else:
        df[target_col] = df[target_col].astype(float)

    feature_cols = [c for c in ML_FEATURES_V1 if c in df.columns]
    warnings = validate_dataset(df, target_col)
    return Dataset(df=df, feature_cols=feature_cols, target_col=target_col, target_meta=target_meta, warnings=warnings)
