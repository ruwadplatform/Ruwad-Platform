from __future__ import annotations

import numpy as np

from app.training.calibrate import expected_calibration_error, fit_calibration


def test_expected_calibration_error_zero_for_perfectly_calibrated_probs():
    rng = np.random.default_rng(0)
    y_prob = rng.uniform(0, 1, size=5000)
    y_true = (rng.uniform(0, 1, size=5000) < y_prob).astype(int)
    ece = expected_calibration_error(y_true, y_prob, n_bins=10)
    assert ece < 0.05


def test_expected_calibration_error_high_for_overconfident_probs():
    y_true = np.array([0, 0, 0, 0, 1, 1, 1, 1])
    y_prob = np.array([0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95])  # always confident, half wrong
    ece = expected_calibration_error(y_true, y_prob)
    assert ece > 0.3


def test_fit_calibration_is_fit_only_on_the_data_passed_in():
    rng = np.random.default_rng(1)
    val_y = rng.integers(0, 2, size=200)
    val_prob = np.clip(val_y * 0.6 + rng.normal(0.2, 0.15, size=200), 0, 1)
    result = fit_calibration(val_y, val_prob, method="isotonic")
    # Applying the SAME data it was fit on should improve (or at least not
    # worsen) calibration — the whole point of the fit.
    assert result.ece_after <= result.ece_before + 1e-9


def test_calibration_result_apply_returns_probabilities_in_bounds():
    val_y = np.array([0, 0, 1, 1, 1, 0, 1, 0])
    val_prob = np.array([0.1, 0.2, 0.8, 0.9, 0.6, 0.3, 0.7, 0.4])
    result = fit_calibration(val_y, val_prob, method="sigmoid")
    calibrated = result.apply(np.array([0.0, 0.5, 1.0]))
    assert np.all(calibrated >= 0) and np.all(calibrated <= 1)
