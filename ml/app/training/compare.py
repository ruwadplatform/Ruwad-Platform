"""Model comparison — a plain table, no automatic winner selection. Model
promotion (CANDIDATE -> SHADOW -> ACTIVE) is always a human admin decision
(see backend's MlModelRegistryService), informed by discrimination,
calibration, stability and data size together — never by picking whichever
row has the single highest metric.
"""
from __future__ import annotations

from dataclasses import dataclass

from .evaluate import ClassificationMetrics, RegressionMetrics
from .model_types import TrainedModel


@dataclass
class ComparisonRow:
    algorithm: str
    metrics: dict


def build_comparison_table(rows: list[tuple[TrainedModel, ClassificationMetrics | RegressionMetrics]]) -> list[ComparisonRow]:
    return [ComparisonRow(algorithm=model.algorithm, metrics=metrics.to_dict()) for model, metrics in rows]


def print_comparison_table(rows: list[ComparisonRow]) -> None:
    if not rows:
        print("No models to compare.")
        return
    metric_keys = list(rows[0].metrics.keys())
    header = "Model".ljust(28) + "".join(k[:12].ljust(14) for k in metric_keys if not isinstance(rows[0].metrics[k], list))
    print(header)
    print("-" * len(header))
    for row in rows:
        line = row.algorithm.ljust(28)
        for k in metric_keys:
            v = row.metrics[k]
            if isinstance(v, list):
                continue
            line += (f"{v:.4f}" if isinstance(v, float) else str(v)).ljust(14)
        print(line)
