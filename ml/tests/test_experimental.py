"""Tests for the experimental-training tooling. Synthetic frames here exercise the TOOLING only (guards, metrics validity,
grouping, registry labelling) — they are never used to train or register a model."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from app.registry.metadata import ModelMetadata
from app.registry.registry import build_model_version
from app.training.experimental import (
    CALIBRATION_NOTE, NOT_EVALUABLE, ExperimentalTrainingBlocked, calibration_status, check_experimental_condition, leave_one_startup_out,
    run_experiment, safe_classification_metrics, select_feature_cols,
)
from app.training.frozen_dataset import FrozenDatasetError, freeze_dataset, load_frozen_dataset, sha256_of
from app.training.target_types import TargetMeta, TargetType

TARGET = "raisedNewRoundWithin6Months"
COL = f"target_{TARGET}"


def _df(n_groups=8, pos_groups=3):
    rows = []
    for i in range(n_groups):
        rows.append({
            "startupId": f"s{i}", "snapshotId": f"snap{i}", "snapshotAt": f"202{i % 4}-12-31T00:00:00Z", "category": "Digital Health", "startupStage": "Seed",
            "featureSchemaVersion": "ML-FEATURES-1.0", "snapshotSource": "HISTORICAL_RECONSTRUCTION", "snapshotSelectionMethod": "FIXED_CALENDAR_GRID", "trainingEligibility": "ELIGIBLE",
            "teamSize": 5.0 + i, "fundingRounds": float(i % 3), "annualRevenue": np.nan, COL: int(i < pos_groups), f"{COL}_status": "AVAILABLE", "targetVersion": "FUNDING-6M-v1",
        })
    return pd.DataFrame(rows)


def _meta():
    return TargetMeta(name=TARGET, group="FUNDING", target_version="FUNDING-6M-v1", window_months=6, target_type=TargetType.CLASSIFICATION)


def _readiness(n):
    return {"readinessVersion": 2, "ready": False, "target": TARGET, "usableExamples": n, "positiveExamples": 3, "negativeExamples": n - 3, "featureCoverage": 0.2, "reasons": ["x"], "unknownExamples": 5, "analysisOnlySnapshots": 15, "excludedSnapshots": 0, "totalSnapshots": 35}


class _Client:
    def __init__(self, df, readiness):
        self._df, self._r = df, readiness

    def fetch_readiness(self, target):
        return self._r

    def fetch_export(self, target, **kw):
        return self._df.to_dict("records")

    def fetch_readiness_dashboard(self):
        return {"evidence": {"verifiedPct": 10}, "outcomeCoverage": [], "caveats": {}}


def test_a_single_class_dataset_blocks_experimental_training():
    with pytest.raises(ExperimentalTrainingBlocked, match="single-class"):
        check_experimental_condition(_df(pos_groups=0), COL)
    with pytest.raises(ExperimentalTrainingBlocked, match="single-class"):
        check_experimental_condition(_df(pos_groups=8), COL)


def test_both_classes_pass_the_experimental_condition_only():
    assert check_experimental_condition(_df(), COL) == {"positive": 3, "negative": 5, "startups": 8}


def test_pooled_metrics_are_not_evaluable_with_one_class_and_valid_with_two():
    one = safe_classification_metrics(np.array([0, 0, 0]), np.array([0.2, 0.4, 0.1]))
    assert one["rocAuc"] == NOT_EVALUABLE and one["prAuc"] == NOT_EVALUABLE and one["logLoss"] == NOT_EVALUABLE
    two = safe_classification_metrics(np.array([0, 1, 0, 1]), np.array([0.1, 0.9, 0.4, 0.6]))
    assert two["rocAuc"] == 1.0 and 0 <= two["brierScore"] <= 1
    assert two["precision"] == 1.0 and two["recall"] == 1.0


def test_precision_is_not_fabricated_when_nothing_is_predicted_positive():
    m = safe_classification_metrics(np.array([0, 1]), np.array([0.1, 0.2]))
    assert m["precision"] == NOT_EVALUABLE and m["f1"] == NOT_EVALUABLE


def test_calibration_is_refused_at_small_sample_sizes():
    assert calibration_status(15, 4) == CALIBRATION_NOTE
    assert calibration_status(500, 80) == "AVAILABLE"


def test_leave_one_startup_out_never_trains_on_the_held_out_startup():
    df = _df()
    seen: list[set] = []

    class _M:
        def predict(self, d):
            return np.full(len(d), 0.5)

    def trainer(train):
        seen.append(set(train["startupId"]))
        return _M()

    out = leave_one_startup_out(df, trainer, COL)
    assert len(seen) == df["startupId"].nunique()
    for held, train_groups in zip(df["startupId"].unique(), seen):
        assert held not in train_groups
    assert out["oof"].notna().all()


def test_features_are_chosen_by_availability_not_by_label():
    cols = select_feature_cols(_df())
    assert "teamSize" in cols and "fundingRounds" in cols and "annualRevenue" not in cols


def test_run_experiment_names_no_winner_and_returns_calibration_refusal():
    run = run_experiment(_df(), {"target": TARGET}, ["logistic"], seed=1)
    assert run["winner"] == "NO RELIABLE WINNER AT CURRENT SAMPLE SIZE"
    assert run["calibration"] == CALIBRATION_NOTE
    assert "majority" in run["results"] and "majority" not in run["fitted"]
    assert run["results"]["logistic"]["perFold"]["status"] == NOT_EVALUABLE


def test_freeze_is_write_once_and_only_accepts_eligible_labelled_rows(tmp_path):
    df = _df()
    out = freeze_dataset(_Client(df, _readiness(len(df))), _meta(), dataset_version="V-TEST", out_root=tmp_path, git_commit="abc123")
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["rowCount"] == 8 and manifest["positiveCount"] == 3 and manifest["gitCommit"] == "abc123" and manifest["readinessVersion"] == 2
    assert manifest["csvSha256"] == sha256_of(out / "dataset.csv")
    # startupStage is the CURRENT stage at snapshot build time (would leak later funding), so it is never frozen
    assert "startupStage" not in pd.read_csv(out / "dataset.csv").columns and "startupStage" in manifest["droppedColumns"]
    with pytest.raises(FrozenDatasetError, match="write-once"):
        freeze_dataset(_Client(df, _readiness(len(df))), _meta(), dataset_version="V-TEST", out_root=tmp_path, git_commit="abc123")
    bad = df.copy(); bad.loc[0, "trainingEligibility"] = "ANALYSIS_ONLY"
    with pytest.raises(FrozenDatasetError, match="not training-ELIGIBLE"):
        freeze_dataset(_Client(bad, _readiness(len(bad))), _meta(), dataset_version="V-BAD", out_root=tmp_path, git_commit="abc")
    with pytest.raises(FrozenDatasetError, match="Readiness V2"):
        freeze_dataset(_Client(df, {**_readiness(len(df)), "readinessVersion": 1}), _meta(), dataset_version="V-V1", out_root=tmp_path, git_commit="abc")


def test_a_modified_frozen_dataset_is_detected(tmp_path):
    df = _df()
    out = freeze_dataset(_Client(df, _readiness(len(df))), _meta(), dataset_version="V-HASH", out_root=tmp_path, git_commit="abc")
    loaded, _ = load_frozen_dataset(out)
    assert len(loaded) == 8
    with (out / "dataset.csv").open("a", encoding="utf-8") as fh:
        fh.write("tamper\n")
    with pytest.raises(FrozenDatasetError, match="hash"):
        load_frozen_dataset(out)


def test_experimental_models_get_an_exp_prefix_and_flag():
    assert build_model_version(TARGET, 6, "catboost", is_experimental=True).startswith("exp-")
    assert not build_model_version(TARGET, 6, "catboost").startswith("exp-")
    md = ModelMetadata(model_version="v", target_name=TARGET, target_version="t", feature_schema_version="f", algorithm="catboost", is_experimental=True)
    assert md.to_dict()["isExperimental"] is True and ModelMetadata.from_dict(md.to_dict()).is_experimental is True
