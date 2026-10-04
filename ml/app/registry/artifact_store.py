"""Filesystem model artifact storage — local disk only for now
(`ARTIFACT_DIR`, default `ml/artifacts/`). Deliberately a small, swappable
abstraction: the interface below (save/load/list/delete by modelVersion)
is exactly what an S3/GCS/Azure Blob-backed implementation would also
need, but no cloud infrastructure is added until it's actually necessary —
see docs/ml-training-methodology.md.

Model binaries are NOT committed to git — `ml/artifacts/` is gitignored.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import joblib

from .metadata import ModelMetadata


class ArtifactNotFoundError(FileNotFoundError):
    pass


class ArtifactStore:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _model_dir(self, model_version: str) -> Path:
        return self.base_dir / model_version

    def save(self, estimator: Any, preprocessor: Any, metadata: ModelMetadata) -> str:
        model_dir = self._model_dir(metadata.model_version)
        model_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(estimator, model_dir / "estimator.joblib")
        joblib.dump(preprocessor, model_dir / "preprocessor.joblib")
        (model_dir / "metadata.json").write_text(json.dumps(metadata.to_dict(), indent=2))
        # Relative path, exactly what gets reported to NestJS as
        # `artifactLocation` — never an absolute filesystem path.
        return metadata.model_version

    def load(self, model_version: str) -> tuple[Any, Any, ModelMetadata]:
        model_dir = self._model_dir(model_version)
        metadata_path = model_dir / "metadata.json"
        if not metadata_path.exists():
            raise ArtifactNotFoundError(f"No artifact found for model version \"{model_version}\"")
        metadata = ModelMetadata.from_dict(json.loads(metadata_path.read_text()))
        estimator = joblib.load(model_dir / "estimator.joblib")
        preprocessor = joblib.load(model_dir / "preprocessor.joblib")
        return estimator, preprocessor, metadata

    def read_profile(self, model_version: str) -> dict | None:
        """Optional sidecar `training_profile.json` (per-feature training counts and min/max only; no rows).
        Written separately from the model files, which are never rewritten."""
        path = self._model_dir(model_version) / "training_profile.json"
        return json.loads(path.read_text()) if path.exists() else None

    def write_profile(self, model_version: str, profile: dict) -> Path:
        model_dir = self._model_dir(model_version)
        if not (model_dir / "metadata.json").exists():
            raise ArtifactNotFoundError(f'No artifact found for model version "{model_version}"')
        path = model_dir / "training_profile.json"
        path.write_text(json.dumps(profile, indent=2))
        return path

    def list_local_models(self) -> list[ModelMetadata]:
        out: list[ModelMetadata] = []
        if not self.base_dir.exists():
            return out
        for child in sorted(self.base_dir.iterdir()):
            metadata_path = child / "metadata.json"
            if metadata_path.exists():
                out.append(ModelMetadata.from_dict(json.loads(metadata_path.read_text())))
        return out

    def delete(self, model_version: str) -> None:
        """Only ever called for TEST_ONLY cleanup — a real model's artifact
        is never deleted through normal operation (RETIRED models keep
        their artifact for audit/rollback purposes)."""
        model_dir = self._model_dir(model_version)
        if model_dir.exists():
            shutil.rmtree(model_dir)
