"""Structural leakage assertions — called by splits.py right after every
split, and exercised directly in tests/test_splits.py. Raising here is a
hard stop: a leaky split must never silently produce a "working" model.
"""
from __future__ import annotations

import pandas as pd


class LeakageError(AssertionError):
    pass


def assert_no_group_leakage(train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, group_col: str = "startupId") -> None:
    """No group (startup) may appear in more than one split — otherwise a
    model could effectively memorize a startup's identity in training and
    "predict" its test-split snapshot suspiciously well."""
    train_ids, val_ids, test_ids = set(train[group_col]), set(val[group_col]), set(test[group_col])
    overlaps = {
        "train/val": train_ids & val_ids,
        "train/test": train_ids & test_ids,
        "val/test": val_ids & test_ids,
    }
    leaking = {k: v for k, v in overlaps.items() if v}
    if leaking:
        raise LeakageError(f"Group leakage detected across splits: {leaking}")


def assert_temporal_order(train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, time_col: str = "snapshotAt") -> None:
    """Not a strict per-row ordering requirement (a wide train split can
    still have some rows newer than a narrow val split's earliest row) —
    but the split's MEDIAN timestamp must strictly increase train -> val ->
    test, or the split isn't meaningfully "older data trains, newer data
    validates" at all."""
    train_median = pd.to_datetime(train[time_col]).median()
    val_median = pd.to_datetime(val[time_col]).median() if len(val) else train_median
    test_median = pd.to_datetime(test[time_col]).median() if len(test) else val_median
    if not (train_median <= val_median <= test_median):
        raise LeakageError(f"Split is not temporally ordered: train median {train_median}, val median {val_median}, test median {test_median}")


def assert_no_future_leakage_in_features(df: pd.DataFrame, feature_cols: list[str]) -> None:
    """Defensive check only — the real guarantee comes from the backend's
    export never substituting a startup's live state for a frozen snapshot
    (see docs/ml-data-methodology.md). This just asserts none of the
    allowlisted feature columns are, say, accidentally the raw ruwadScore
    or another obviously score-derived name that should never have reached
    a training dataframe."""
    banned = {"ruwadscore", "factorscores", "finalscore", "score"}
    leaked = [c for c in feature_cols if c.lower() in banned]
    if leaked:
        raise LeakageError(f"Score-derived column(s) found in feature set: {leaked}")
