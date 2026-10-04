"""Loads model artifacts by explicit modelVersion — NestJS's `ml_models`
table (via MlModelRegistryService.findEligibleForShadowPrediction) is what
decides WHICH model versions are worth asking for; this loader never
independently decides "the current model for target X", it only ever
serves what it's explicitly asked for. In-memory cache so repeated
predictions against the same model don't re-read disk every time.

Production hardening (both optional, both off for local development):
  * `allowed_versions` — refuse every model except the explicitly configured one;
  * `verifier`         — refuse any model whose files do not match the committed
                         manifest, checked BEFORE the joblib files are unpickled.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

from ..registry.artifact_store import ArtifactNotFoundError, ArtifactStore
from ..registry.metadata import ModelMetadata
from .integrity import VerificationResult

logger = logging.getLogger("ruwad.ml.loader")


@dataclass
class LoadedModel:
    estimator: Any
    preprocessor: Any
    metadata: ModelMetadata


class ModelLoader:
    def __init__(self, store: ArtifactStore, verifier: Callable[[str], VerificationResult] | None = None, allowed_versions: set[str] | None = None):
        self._store = store
        self._verifier = verifier
        self._allowed = allowed_versions
        self._cache: dict[str, LoadedModel] = {}
        self.verification: dict[str, VerificationResult] = {}

    def verify(self, model_version: str) -> VerificationResult | None:
        """None when no verifier is configured. The result is cached: a version is hashed once per process."""
        if self._verifier is None:
            return None
        if model_version not in self.verification:
            result = self._verifier(model_version)
            self.verification[model_version] = result
            if not result.ok:
                logger.error("artifact verification FAILED for %s: %s", model_version, "; ".join(result.problems))
        return self.verification[model_version]

    def get(self, model_version: str) -> LoadedModel | None:
        if self._allowed is not None and model_version not in self._allowed:
            return None
        if model_version in self._cache:
            return self._cache[model_version]
        check = self.verify(model_version)
        if check is not None and not check.ok:
            return None
        try:
            estimator, preprocessor, metadata = self._store.load(model_version)
        except ArtifactNotFoundError:
            return None
        except Exception:  # noqa: BLE001 — a corrupt or incompatible artifact must read as "unavailable", never as a crash
            logger.exception("model load failed for %s", model_version)
            return None
        loaded = LoadedModel(estimator=estimator, preprocessor=preprocessor, metadata=metadata)
        self._cache[model_version] = loaded
        return loaded

    def profile(self, model_version: str) -> dict | None:
        return self._store.read_profile(model_version)

    def invalidate(self, model_version: str) -> None:
        self._cache.pop(model_version, None)
        self.verification.pop(model_version, None)

    def list_available(self) -> list[ModelMetadata]:
        return self._store.list_local_models()
