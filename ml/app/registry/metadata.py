"""Local model metadata — what the Python service's own inference loader
reads to find a model's artifact. NestJS's `ml_models` table is the
authority on STATUS (see backend/src/ml-data/ml-model-registry.service.ts);
this file is operational, filesystem-scoped bookkeeping only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class ModelMetadata:
    model_version: str
    target_name: str
    target_version: str
    feature_schema_version: str
    algorithm: str
    prediction_type: str = "PROBABILITY"  # or "REGRESSION_VALUE" — see app/training/target_types.py's TargetType
    hyperparameters: dict = field(default_factory=dict)
    feature_cols: list[str] = field(default_factory=list)
    categorical_cols: list[str] = field(default_factory=list)
    training_rows: int = 0
    validation_rows: int = 0
    test_rows: int = 0
    metrics: dict = field(default_factory=dict)
    is_test_only: bool = False
    trained_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "modelVersion": self.model_version, "targetName": self.target_name, "targetVersion": self.target_version,
            "featureSchemaVersion": self.feature_schema_version, "algorithm": self.algorithm, "predictionType": self.prediction_type,
            "hyperparameters": self.hyperparameters, "featureCols": self.feature_cols, "categoricalCols": self.categorical_cols,
            "trainingRows": self.training_rows, "validationRows": self.validation_rows, "testRows": self.test_rows,
            "metrics": self.metrics, "isTestOnly": self.is_test_only, "trainedAt": self.trained_at,
        }

    @staticmethod
    def from_dict(d: dict) -> "ModelMetadata":
        return ModelMetadata(
            model_version=d["modelVersion"], target_name=d["targetName"], target_version=d["targetVersion"],
            feature_schema_version=d["featureSchemaVersion"], algorithm=d["algorithm"], prediction_type=d.get("predictionType", "PROBABILITY"),
            hyperparameters=d.get("hyperparameters", {}),
            feature_cols=d.get("featureCols", []), categorical_cols=d.get("categoricalCols", []),
            training_rows=d.get("trainingRows", 0), validation_rows=d.get("validationRows", 0), test_rows=d.get("testRows", 0),
            metrics=d.get("metrics", {}), is_test_only=d.get("isTestOnly", False), trained_at=d.get("trainedAt", ""),
        )
