"""High-level registry: combines local artifact storage with reporting the
same metadata back to NestJS's `ml_models` table (the status authority —
see backend/src/ml-data/ml-model-registry.service.ts). A model version is
never considered "registered" until BOTH steps succeed; if the remote
report fails, the local artifact is still on disk (so nothing is lost) but
the caller is told clearly that the model isn't visible in the admin UI
yet and should retry the report.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..ruwad_client import RuwadClient
from .artifact_store import ArtifactStore
from .metadata import ModelMetadata


def build_model_version(target_name: str, window_months: int, algorithm: str, *, is_test_only: bool = False) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    prefix = "test-" if is_test_only else ""
    return f"{prefix}{target_name}-{window_months}m-{algorithm}-{ts}"


def register_trained_model(
    store: ArtifactStore, client: RuwadClient, *, estimator: Any, preprocessor: Any, metadata: ModelMetadata,
    training_period_start: str | None = None, training_period_end: str | None = None,
) -> dict:
    """Saves the artifact locally, then reports the same metadata to
    NestJS. Always sends `isTestOnly` honestly — the backend, not this
    function, is what actually enforces "TEST_ONLY can never become
    ACTIVE" (see MlModelRegistryService's transition guard); this call
    just tells it the truth about what kind of run this was."""
    store.save(estimator, preprocessor, metadata)

    payload = {
        "modelVersion": metadata.model_version, "targetName": metadata.target_name, "targetVersion": metadata.target_version,
        "featureSchemaVersion": metadata.feature_schema_version, "algorithm": metadata.algorithm,
        "hyperparameters": metadata.hyperparameters, "trainingRows": metadata.training_rows,
        "validationRows": metadata.validation_rows, "testRows": metadata.test_rows,
        "trainingPeriodStart": training_period_start, "trainingPeriodEnd": training_period_end,
        "metrics": metadata.metrics, "artifactLocation": metadata.model_version, "isTestOnly": metadata.is_test_only,
        "trainedAt": metadata.trained_at,
    }
    return client.register_model(payload)
