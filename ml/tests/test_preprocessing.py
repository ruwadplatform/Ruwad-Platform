from __future__ import annotations

import numpy as np
import pandas as pd

from app.ml_features import ML_FEATURES_V1
from app.training.preprocessing import fit_imputed_preprocessor, infinities_to_nan, native_preprocessor, preprocessor_from_dict


def test_native_preprocessor_preserves_nan_never_zero_fills(synthetic_df_classification):
    pre = native_preprocessor()
    out = pre.transform(synthetic_df_classification, ML_FEATURES_V1)
    # The synthetic fixture deliberately injects ~8% missing values —
    # native preprocessing must leave at least some of them as real NaN,
    # not coerce them to 0.
    numeric_col = "patentsGranted"
    assert out[numeric_col].isna().any()


def test_native_preprocessor_keeps_categorical_as_string(synthetic_df_classification):
    pre = native_preprocessor()
    out = pre.transform(synthetic_df_classification, ML_FEATURES_V1)
    assert out["regulatoryMilestone"].dtype == "string"


def test_imputed_preprocessor_fit_only_on_train_never_refits_on_transform(synthetic_df_classification):
    train = synthetic_df_classification.iloc[:30]
    other = synthetic_df_classification.iloc[30:]
    pre = fit_imputed_preprocessor(train, ML_FEATURES_V1)
    medians_after_fit = dict(pre.medians)
    pre.transform(other, ML_FEATURES_V1)
    assert pre.medians == medians_after_fit


def test_imputed_preprocessor_adds_missing_indicator_columns(synthetic_df_classification):
    pre = fit_imputed_preprocessor(synthetic_df_classification, ML_FEATURES_V1)
    out = pre.transform(synthetic_df_classification, ML_FEATURES_V1)
    assert "patentsGranted_missing" in out.columns
    assert set(out["patentsGranted_missing"].unique()).issubset({0, 1})


def test_imputed_preprocessor_output_has_no_nan(synthetic_df_classification):
    pre = fit_imputed_preprocessor(synthetic_df_classification, ML_FEATURES_V1)
    out = pre.transform(synthetic_df_classification, ML_FEATURES_V1)
    assert not out.isna().any().any()


def test_preprocessor_roundtrips_through_dict(synthetic_df_classification):
    pre = fit_imputed_preprocessor(synthetic_df_classification, ML_FEATURES_V1)
    restored = preprocessor_from_dict(pre.to_dict())
    a = pre.transform(synthetic_df_classification, ML_FEATURES_V1)
    b = restored.transform(synthetic_df_classification, ML_FEATURES_V1)
    pd.testing.assert_frame_equal(a, b)


def test_infinities_to_nan_never_silently_clips():
    df = pd.DataFrame({"x": [1.0, np.inf, -np.inf, 5.0]})
    out = infinities_to_nan(df)
    assert out["x"].iloc[0] == 1.0
    assert out["x"].iloc[3] == 5.0
    assert np.isnan(out["x"].iloc[1])
    assert np.isnan(out["x"].iloc[2])
