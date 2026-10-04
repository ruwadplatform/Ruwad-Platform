from __future__ import annotations

import pytest

from app.registry.artifact_store import ArtifactNotFoundError, ArtifactStore
from app.registry.metadata import ModelMetadata
from app.registry.registry import build_model_version, register_trained_model


def _metadata(model_version: str, *, is_test_only: bool = True) -> ModelMetadata:
    return ModelMetadata(
        model_version=model_version, target_name="raisedNewRoundWithin12Months", target_version="v1",
        feature_schema_version="ML-FEATURES-1.0", algorithm="catboost", training_rows=10, validation_rows=2,
        test_rows=2, metrics={"test": {"rocAuc": 0.7}}, is_test_only=is_test_only,
    )


def test_build_model_version_tags_test_only_runs_with_a_test_prefix():
    real = build_model_version("raisedNewRoundWithin12Months", 12, "catboost", is_test_only=False)
    test = build_model_version("raisedNewRoundWithin12Months", 12, "catboost", is_test_only=True)
    assert not real.startswith("test-")
    assert test.startswith("test-")
    assert "catboost" in real and "catboost" in test


def test_artifact_store_round_trips_estimator_preprocessor_and_metadata(tmp_path):
    store = ArtifactStore(str(tmp_path))
    metadata = _metadata("test-target-12m-catboost-20260101000000")
    estimator = {"fake": "estimator"}
    preprocessor = {"fake": "preprocessor"}
    store.save(estimator, preprocessor, metadata)

    loaded_estimator, loaded_preprocessor, loaded_metadata = store.load(metadata.model_version)
    assert loaded_estimator == estimator
    assert loaded_preprocessor == preprocessor
    assert loaded_metadata.model_version == metadata.model_version
    assert loaded_metadata.is_test_only is True


def test_artifact_store_raises_typed_error_for_missing_model(tmp_path):
    store = ArtifactStore(str(tmp_path))
    with pytest.raises(ArtifactNotFoundError):
        store.load("does-not-exist")


def test_artifact_store_list_local_models_reflects_saved_artifacts(tmp_path):
    store = ArtifactStore(str(tmp_path))
    store.save({}, {}, _metadata("a-model"))
    store.save({}, {}, _metadata("b-model"))
    versions = {m.model_version for m in store.list_local_models()}
    assert versions == {"a-model", "b-model"}


def test_artifact_store_delete_removes_the_model_directory(tmp_path):
    store = ArtifactStore(str(tmp_path))
    store.save({}, {}, _metadata("temp-model"))
    store.delete("temp-model")
    with pytest.raises(ArtifactNotFoundError):
        store.load("temp-model")


def test_register_trained_model_saves_locally_and_reports_to_backend_honestly(tmp_path, fake_client):
    store = ArtifactStore(str(tmp_path))
    metadata = _metadata("test-target-12m-catboost-20260101000000", is_test_only=True)
    register_trained_model(store, fake_client, estimator={}, preprocessor={}, metadata=metadata)

    assert len(fake_client.registered_models) == 1
    sent = fake_client.registered_models[0]
    assert sent["isTestOnly"] is True
    assert sent["modelVersion"] == metadata.model_version
    # The local artifact exists regardless of what happens on the backend side.
    store.load(metadata.model_version)
