from __future__ import annotations

from app.ml_features import ML_FEATURES_V1
from app.training.baselines import train_logistic_regression_baseline
from app.training.catboost_model import train_catboost
from app.training.explain import explain_tree_model
from app.training.splits import temporal_group_split
from app.training.target_types import TargetType


def test_explain_tree_model_returns_ranked_global_importance(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    model = train_catboost(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    result = explain_tree_model(model, split.train)
    assert result.available is True
    assert len(result.global_importance) > 0
    scores = [row["meanAbsShap"] for row in result.global_importance]
    assert scores == sorted(scores, reverse=True)


def test_explain_tree_model_degrades_gracefully_for_non_tree_models(synthetic_df_classification):
    model = train_logistic_regression_baseline(synthetic_df_classification, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months")
    result = explain_tree_model(model, synthetic_df_classification)
    assert result.available is False
    assert result.reason is not None
    assert result.global_importance == []
