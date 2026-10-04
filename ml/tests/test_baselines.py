from __future__ import annotations

from app.ml_features import ML_FEATURES_V1
from app.training.baselines import train_baselines
from app.training.target_types import TargetType


def test_classification_baselines_return_two_models(synthetic_df_classification, classification_target_meta):
    models = train_baselines(synthetic_df_classification, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    assert {m.algorithm for m in models} == {"baseline-majority-class", "baseline-logistic-regression"}


def test_regression_baselines_return_two_models(synthetic_df_regression, regression_target_meta):
    models = train_baselines(synthetic_df_regression, ML_FEATURES_V1, "target_revenueGrowthWithin12Months", TargetType.REGRESSION)
    assert {m.algorithm for m in models} == {"baseline-median", "baseline-ridge"}


def test_majority_class_baseline_predicts_constant_probability(synthetic_df_classification):
    models = train_baselines(synthetic_df_classification, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    majority = next(m for m in models if m.algorithm == "baseline-majority-class")
    preds = majority.predict(synthetic_df_classification.iloc[:10])
    assert len(set(round(p, 6) for p in preds)) == 1  # same prediction regardless of input features


def test_baseline_predictions_are_in_valid_range(synthetic_df_classification):
    models = train_baselines(synthetic_df_classification, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    for model in models:
        preds = model.predict(synthetic_df_classification)
        assert (preds >= 0).all() and (preds <= 1).all()
