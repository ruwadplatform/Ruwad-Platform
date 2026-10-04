from __future__ import annotations

import pytest

from app.training.dataset import load_dataset
from app.training.target_types import TargetMeta, TargetType
from app.validation.data_quality import DataQualityError


def _rows(n=5):
    return [
        {
            "startupId": f"s{i}", "snapshotId": f"snap{i}", "snapshotAt": "2025-01-01T00:00:00Z",
            "target_raisedNewRoundWithin12Months": bool(i % 2), "target_raisedNewRoundWithin12Months_status": "AVAILABLE",
            "annualRevenue": 1000.0 * i, "regulatoryMilestone": "PRECLINICAL", "trainingEligibility": "ELIGIBLE",
        }
        for i in range(n)
    ]


def test_load_dataset_filters_to_available_status_rows(fake_client):
    rows = _rows(4)
    rows[0]["target_raisedNewRoundWithin12Months_status"] = "IMMATURE"
    fake_client._export_rows = rows
    meta = TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)
    dataset = load_dataset(fake_client, meta)
    assert len(dataset.df) == 3  # the IMMATURE row is dropped, never trained on


def test_load_dataset_coerces_classification_target_to_int(fake_client):
    fake_client._export_rows = _rows(4)
    meta = TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)
    dataset = load_dataset(fake_client, meta)
    assert set(dataset.df[dataset.target_col].unique()).issubset({0, 1})


def test_load_dataset_raises_on_empty_export(fake_client):
    fake_client._export_rows = []
    meta = TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)
    with pytest.raises(DataQualityError):
        load_dataset(fake_client, meta)


def test_load_dataset_feature_cols_are_restricted_to_the_allowlist(fake_client):
    rows = _rows(3)
    rows[0]["someUnexpectedPiiField"] = "should never appear as a feature"
    fake_client._export_rows = rows
    meta = TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)
    dataset = load_dataset(fake_client, meta)
    assert "someUnexpectedPiiField" not in dataset.feature_cols


def test_load_dataset_never_trains_on_analysis_only_rows(fake_client):
    rows = _rows(6)
    rows[0]["trainingEligibility"] = "ANALYSIS_ONLY"  # e.g. a legacy outcome-aware snapshot
    rows[1]["trainingEligibility"] = "EXCLUDED"
    fake_client._export_rows = rows
    meta = TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)
    dataset = load_dataset(fake_client, meta)
    assert len(dataset.df) == 4
    assert set(dataset.df["trainingEligibility"]) == {"ELIGIBLE"}


def test_load_dataset_refuses_an_export_that_does_not_say_what_each_row_is(fake_client):
    rows = _rows(4)
    for r in rows:
        del r["trainingEligibility"]
    fake_client._export_rows = rows
    meta = TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)
    with pytest.raises(DataQualityError):
        load_dataset(fake_client, meta)


def test_load_dataset_raises_when_no_eligible_rows_remain(fake_client):
    rows = _rows(4)
    for r in rows:
        r["trainingEligibility"] = "ANALYSIS_ONLY"
    fake_client._export_rows = rows
    meta = TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)
    with pytest.raises(DataQualityError):
        load_dataset(fake_client, meta)
