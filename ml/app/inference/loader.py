"""Loads model artifacts by explicit modelVersion — NestJS's `ml_models`
table (via MlModelRegistryService.findEligibleForShadowPrediction) is what
decides WHICH model versions are worth asking for; this loader never
independently decides "the current model for target X", it only ever
serves what it's explicitly asked for. In-memory cache so repeated
predictions against the same model don't re-read disk every time.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..registry.artifact_store import ArtifactNotFoundError, ArtifactStore
from ..registry.metadata import ModelMetadata


@dataclass
class LoadedModel:
    estimator: Any
    preprocessor: Any
    metadata: ModelMetadata


class ModelLoader:
    def __init__(self, store: ArtifactStore):
        self._store = store
        self._cache: dict[str, LoadedModel] = {}

    def get(self, model_version: str) -> LoadedModel | None:
        if model_version in self._cache:
            return self._cache[model_version]
        try:
            estimator, preprocessor, metadata = self._store.load(model_version)
        except ArtifactNotFoundError:
            return None
        loaded = LoadedModel(estimator=estimator, preprocessor=preprocessor, metadata=metadata)
        self._cache[model_version] = loaded
        return loaded

    def invalidate(self, model_version: str) -> None:
        self._cache.pop(model_version, None)

    def list_available(self) -> list[ModelMetadata]:
        return self._store.list_local_models()
