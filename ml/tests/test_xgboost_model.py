from __future__ import annotations

from app.ml_features import ML_FEATURES_V1
from app.training.splits import temporal_group_split
from app.training.target_types import TargetType
from app.training.xgboost_model import train_xgboost


def test_xgboost_trains_and_predicts_in_valid_range(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    model = train_xgboost(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION, random_seed=42)
    preds = model.predict(split.train.iloc[:20])
    assert (preds >= 0).all() and (preds <= 1).all()
    assert model.algorithm == "xgboost"


def test_xgboost_handles_categorical_and_missing_values(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    model = train_xgboost(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    row = split.train.iloc[[0]].copy()
    row["regulatoryMilestone"] = None
    row["patentsGranted"] = None
    preds = model.predict(row)
    assert len(preds) == 1


def test_xgboost_trains_without_validation_set(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    empty_val = split.val.iloc[0:0]
    model = train_xgboost(split.train, empty_val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    preds = model.predict(split.train.iloc[:5])
    assert len(preds) == 5


def test_xgboost_regression_predicts_reasonable_values(synthetic_df_regression):
    split = temporal_group_split(synthetic_df_regression)
    model = train_xgboost(split.train, split.val, ML_FEATURES_V1, "target_revenueGrowthWithin12Months", TargetType.REGRESSION)
    preds = model.predict(split.train.iloc[:10])
    assert len(preds) == 10
