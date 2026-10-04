from __future__ import annotations

import numpy as np

from app.training.evaluate import evaluate_classification, evaluate_regression


def test_evaluate_classification_perfect_predictions_score_well():
    y_true = np.array([0, 0, 1, 1, 1, 0])
    y_prob = np.array([0.01, 0.02, 0.98, 0.95, 0.9, 0.05])
    m = evaluate_classification(y_true, y_prob)
    assert m.roc_auc == 1.0
    assert m.precision == 1.0
    assert m.recall == 1.0
    assert m.n == 6


def test_evaluate_classification_random_predictions_score_near_baseline():
    rng = np.random.default_rng(0)
    y_true = rng.integers(0, 2, size=200)
    y_prob = rng.uniform(0, 1, size=200)
    m = evaluate_classification(y_true, y_prob)
    assert 0.3 < m.roc_auc < 0.7


def test_evaluate_classification_reports_confusion_matrix_shape():
    m = evaluate_classification(np.array([0, 1]), np.array([0.1, 0.9]))
    assert len(m.confusion_matrix) == 2
    assert len(m.confusion_matrix[0]) == 2


def test_evaluate_classification_single_class_does_not_crash():
    m = evaluate_classification(np.array([1, 1, 1]), np.array([0.6, 0.7, 0.8]))
    assert m.roc_auc is None  # undefined with only one class present — never fabricated
    assert m.n == 3


def test_evaluate_regression_perfect_predictions():
    y_true = np.array([1.0, 2.0, 3.0])
    m = evaluate_regression(y_true, y_true)
    assert m.mae == 0.0
    assert m.rmse == 0.0
    assert m.r2 == 1.0


def test_evaluate_regression_reports_error_magnitude():
    y_true = np.array([10.0, 20.0, 30.0])
    y_pred = np.array([12.0, 18.0, 33.0])
    m = evaluate_regression(y_true, y_pred)
    assert m.mae > 0
    assert m.rmse >= m.mae  # RMSE never smaller than MAE
