"""Probability calibration — fit ONLY on the validation split, never the
test split (test exists purely to report how good the FINAL, calibrated
model is, uncontaminated by anything used to build it). Reports Expected
Calibration Error (ECE) so "is this model's 70% actually 70%" has a real
number, not just a plot nobody looks at.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression


@dataclass
class CalibrationResult:
    method: Literal["isotonic", "sigmoid"]
    ece_before: float
    ece_after: float
    calibrator: object

    def apply(self, probs: np.ndarray) -> np.ndarray:
        probs = np.asarray(probs, dtype=float)
        if self.method == "isotonic":
            return np.clip(self.calibrator.predict(probs), 0, 1)
        # sigmoid (Platt): calibrator is a fitted LogisticRegression on the raw prob as a single feature.
        return np.clip(self.calibrator.predict_proba(probs.reshape(-1, 1))[:, 1], 0, 1)


def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, *, n_bins: int = 10) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.asarray(y_prob, dtype=float)
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    if n == 0:
        return 0.0
    for lo, hi in zip(bins[:-1], bins[1:]):
        mask = (y_prob >= lo) & (y_prob < hi) if hi < 1 else (y_prob >= lo) & (y_prob <= hi)
        if not mask.any():
            continue
        bin_conf = y_prob[mask].mean()
        bin_acc = y_true[mask].mean()
        ece += (mask.sum() / n) * abs(bin_conf - bin_acc)
    return float(ece)


def fit_calibration(val_y: np.ndarray, val_prob: np.ndarray, *, method: Literal["isotonic", "sigmoid"] = "isotonic") -> CalibrationResult:
    """Fit on the validation split only — the caller must never pass test
    data here. See docs/ml-training-methodology.md's calibration section."""
    val_y = np.asarray(val_y, dtype=float)
    val_prob = np.asarray(val_prob, dtype=float)
    ece_before = expected_calibration_error(val_y, val_prob)

    if method == "isotonic":
        calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
        calibrator.fit(val_prob, val_y)
        calibrated = np.clip(calibrator.predict(val_prob), 0, 1)
    else:
        calibrator = LogisticRegression()
        calibrator.fit(val_prob.reshape(-1, 1), val_y)
        calibrated = np.clip(calibrator.predict_proba(val_prob.reshape(-1, 1))[:, 1], 0, 1)

    ece_after = expected_calibration_error(val_y, calibrated)
    return CalibrationResult(method=method, ece_before=ece_before, ece_after=ece_after, calibrator=calibrator)
