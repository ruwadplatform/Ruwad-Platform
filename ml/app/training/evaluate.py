"""Evaluation metrics — never just accuracy (see docs/ml-training-
methodology.md's "why not accuracy alone" section). Classification and
regression are handled by two separate functions since their metrics have
nothing in common; the caller picks based on TargetType.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
    median_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    root_mean_squared_error,
)


@dataclass
class ClassificationMetrics:
    roc_auc: float | None
    pr_auc: float
    log_loss: float | None
    brier_score: float
    precision: float
    recall: float
    f1: float
    confusion_matrix: list[list[int]]
    threshold: float
    n: int
    positive_rate: float

    def to_dict(self) -> dict:
        return {
            "rocAuc": self.roc_auc, "prAuc": self.pr_auc, "logLoss": self.log_loss, "brierScore": self.brier_score,
            "precision": self.precision, "recall": self.recall, "f1": self.f1, "confusionMatrix": self.confusion_matrix,
            "threshold": self.threshold, "n": self.n, "positiveRate": self.positive_rate,
        }


@dataclass
class RegressionMetrics:
    mae: float
    rmse: float
    r2: float
    median_absolute_error: float
    n: int

    def to_dict(self) -> dict:
        return {"mae": self.mae, "rmse": self.rmse, "r2": self.r2, "medianAbsoluteError": self.median_absolute_error, "n": self.n}


def evaluate_classification(y_true: np.ndarray, y_prob: np.ndarray, *, threshold: float = 0.5) -> ClassificationMetrics:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.clip(np.asarray(y_prob, dtype=float), 1e-7, 1 - 1e-7)
    y_pred = (y_prob >= threshold).astype(int)

    n_classes = len(np.unique(y_true))
    roc_auc = float(roc_auc_score(y_true, y_prob)) if n_classes > 1 else None
    log_loss_val = float(log_loss(y_true, y_prob, labels=[0, 1])) if n_classes > 1 else None

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()

    return ClassificationMetrics(
        roc_auc=roc_auc,
        pr_auc=float(average_precision_score(y_true, y_prob)) if n_classes > 1 else float(y_true.mean()),
        log_loss=log_loss_val,
        brier_score=float(brier_score_loss(y_true, y_prob)),
        precision=float(precision_score(y_true, y_pred, zero_division=0)),
        recall=float(recall_score(y_true, y_pred, zero_division=0)),
        f1=float(f1_score(y_true, y_pred, zero_division=0)),
        confusion_matrix=cm,
        threshold=threshold,
        n=len(y_true),
        positive_rate=float(y_true.mean()) if len(y_true) else 0.0,
    )


def evaluate_regression(y_true: np.ndarray, y_pred: np.ndarray) -> RegressionMetrics:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return RegressionMetrics(
        mae=float(mean_absolute_error(y_true, y_pred)),
        rmse=float(root_mean_squared_error(y_true, y_pred)),
        r2=float(r2_score(y_true, y_pred)) if len(y_true) > 1 else 0.0,
        median_absolute_error=float(median_absolute_error(y_true, y_pred)),
        n=len(y_true),
    )
