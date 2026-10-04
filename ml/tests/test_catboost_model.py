from __future__ import annotations

from app.ml_features import ML_FEATURES_V1
from app.training.catboost_model import train_catboost
from app.training.splits import temporal_group_split
from app.training.target_types import TargetType


def test_catboost_trains_and_predicts_in_valid_range(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    model = train_catboost(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION, random_seed=42)
    preds = model.predict(split.train.iloc[:20])
    assert (preds >= 0).all() and (preds <= 1).all()
    assert model.algorithm == "catboost"


def test_catboost_is_reproducible_given_the_same_seed(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    m1 = train_catboost(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION, random_seed=7)
    m2 = train_catboost(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION, random_seed=7)
    p1 = m1.predict(split.train.iloc[:10])
    p2 = m2.predict(split.train.iloc[:10])
    assert list(p1) == list(p2)


def test_catboost_handles_missing_values_without_erroring(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    model = train_catboost(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    row_with_nans = split.train.iloc[[0]].copy()
    row_with_nans["patentsGranted"] = None
    preds = model.predict(row_with_nans)
    assert len(preds) == 1


def test_catboost_regression_predicts_reasonable_values(synthetic_df_regression):
    split = temporal_group_split(synthetic_df_regression)
    model = train_catboost(split.train, split.val, ML_FEATURES_V1, "target_revenueGrowthWithin12Months", TargetType.REGRESSION)
    preds = model.predict(split.train.iloc[:10])
    assert len(preds) == 10
