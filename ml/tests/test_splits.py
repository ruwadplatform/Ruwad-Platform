from __future__ import annotations

import pandas as pd
import pytest

from app.training.splits import temporal_group_split
from app.validation.leakage import LeakageError, assert_no_group_leakage, assert_temporal_order


def test_no_group_ever_spans_two_splits(synthetic_df_classification):
    result = temporal_group_split(synthetic_df_classification)
    train_ids = set(result.train["startupId"])
    val_ids = set(result.val["startupId"])
    test_ids = set(result.test["startupId"])
    assert train_ids.isdisjoint(val_ids)
    assert train_ids.isdisjoint(test_ids)
    assert val_ids.isdisjoint(test_ids)


def test_split_preserves_all_rows(synthetic_df_classification):
    result = temporal_group_split(synthetic_df_classification)
    assert len(result.train) + len(result.val) + len(result.test) == len(synthetic_df_classification)


def test_split_is_deterministic(synthetic_df_classification):
    a = temporal_group_split(synthetic_df_classification)
    b = temporal_group_split(synthetic_df_classification)
    assert list(a.train["startupId"]) == list(b.train["startupId"])
    assert list(a.val["startupId"]) == list(b.val["startupId"])
    assert list(a.test["startupId"]) == list(b.test["startupId"])


def test_train_cohorts_are_never_newer_than_test_cohorts(synthetic_df_classification):
    result = temporal_group_split(synthetic_df_classification)
    if len(result.train) and len(result.test):
        assert pd.to_datetime(result.train["snapshotAt"]).median() <= pd.to_datetime(result.test["snapshotAt"]).median()


def test_rejects_invalid_fractions(synthetic_df_classification):
    with pytest.raises(ValueError):
        temporal_group_split(synthetic_df_classification, train_frac=0.9, val_frac=0.5)


def test_tiny_dataset_never_leaks_even_when_val_or_test_is_empty():
    df = pd.DataFrame({
        "startupId": ["a", "a", "b"],
        "snapshotAt": ["2025-01-01", "2025-02-01", "2025-01-15"],
        "x": [1, 2, 3],
    })
    result = temporal_group_split(df, train_frac=0.6, val_frac=0.3)
    assert_no_group_leakage(result.train, result.val, result.test)
    assert len(result.train) >= 1


def test_assert_no_group_leakage_catches_a_real_leak():
    train = pd.DataFrame({"startupId": ["a", "b"]})
    val = pd.DataFrame({"startupId": ["b", "c"]})
    test = pd.DataFrame({"startupId": ["d"]})
    with pytest.raises(LeakageError):
        assert_no_group_leakage(train, val, test)


def test_assert_temporal_order_catches_reversed_periods():
    train = pd.DataFrame({"snapshotAt": ["2025-06-01"]})
    val = pd.DataFrame({"snapshotAt": ["2025-01-01"]})
    test = pd.DataFrame({"snapshotAt": ["2025-07-01"]})
    with pytest.raises(LeakageError):
        assert_temporal_order(train, val, test)
