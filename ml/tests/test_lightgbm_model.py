from __future__ import annotations

import pytest

from app.ml_features import ML_FEATURES_V1
from app.training.lightgbm_model import LIGHTGBM_AVAILABLE, LightGBMNotAvailableError, train_lightgbm
from app.training.splits import temporal_group_split
from app.training.target_types import TargetType


def test_train_lightgbm_raises_typed_error_when_not_installed(synthetic_df_classification):
    if LIGHTGBM_AVAILABLE:
        pytest.skip("lightgbm is installed in this environment — this test covers the not-installed path")
    split = temporal_group_split(synthetic_df_classification)
    with pytest.raises(LightGBMNotAvailableError):
        train_lightgbm(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)


@pytest.mark.skipif(not LIGHTGBM_AVAILABLE, reason="lightgbm not installed (optional dependency, see requirements-optional.txt)")
def test_lightgbm_trains_and_predicts_in_valid_range(synthetic_df_classification):
    split = temporal_group_split(synthetic_df_classification)
    model = train_lightgbm(split.train, split.val, ML_FEATURES_V1, "target_raisedNewRoundWithin12Months", TargetType.CLASSIFICATION)
    preds = model.predict(split.train.iloc[:10])
    assert (preds >= 0).all() and (preds <= 1).all()
