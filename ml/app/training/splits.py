"""Temporal + grouped train/validation/test splitting — NOT ordinary random
row splitting. A startup's snapshots never span more than one split, and
later time periods land in validation/test.

Algorithm: group rows by startupId, sort the GROUPS by each group's
earliest snapshotAt (its "cohort" date), then walk the sorted groups
assigning each ENTIRE group to train/val/test by cumulative row-fraction
against the requested train_frac/val_frac. This guarantees zero group
leakage (a startup's rows always land together) while keeping the actual
row-count split close to what was asked for, and preserves chronological
ordering (train's cohorts are never newer than val's, val's never newer
than test's).
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ..validation.leakage import assert_no_group_leakage, assert_temporal_order


@dataclass
class SplitResult:
    train: pd.DataFrame
    val: pd.DataFrame
    test: pd.DataFrame


def temporal_group_split(
    df: pd.DataFrame,
    *,
    group_col: str = "startupId",
    time_col: str = "snapshotAt",
    train_frac: float = 0.7,
    val_frac: float = 0.15,
) -> SplitResult:
    if not (0 < train_frac < 1) or not (0 < val_frac < 1) or train_frac + val_frac >= 1:
        raise ValueError("train_frac and val_frac must each be in (0,1) and sum to less than 1")

    working = df.copy()
    working[time_col] = pd.to_datetime(working[time_col])

    cohort_dates = working.groupby(group_col)[time_col].min().sort_values()
    ordered_groups = cohort_dates.index.tolist()

    total_rows = len(working)
    train_cutoff_rows = total_rows * train_frac
    val_cutoff_rows = total_rows * (train_frac + val_frac)

    counts_by_group = working.groupby(group_col).size()
    train_groups: list[str] = []
    val_groups: list[str] = []
    test_groups: list[str] = []
    running = 0
    for group in ordered_groups:
        running += int(counts_by_group.get(group, 0))
        train_is_empty = not train_groups
        val_is_empty = not val_groups
        if running <= train_cutoff_rows or (train_is_empty and val_is_empty):
            train_groups.append(group)
        elif running <= val_cutoff_rows or val_is_empty:
            val_groups.append(group)
        else:
            test_groups.append(group)

    # Guarantee every split has at least the groups assigned to it — if the
    # dataset is tiny (e.g. 2-3 startups), val/test can legitimately end up
    # empty; callers (readiness/training) are responsible for deciding
    # whether that's acceptable, this function never fabricates rows to
    # avoid it.
    train = working[working[group_col].isin(train_groups)].reset_index(drop=True)
    val = working[working[group_col].isin(val_groups)].reset_index(drop=True)
    test = working[working[group_col].isin(test_groups)].reset_index(drop=True)

    assert_no_group_leakage(train, val, test, group_col=group_col)
    if len(val) and len(test):
        assert_temporal_order(train, val, test, time_col=time_col)

    return SplitResult(train=train, val=val, test=test)
