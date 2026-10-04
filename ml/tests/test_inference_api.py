from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ml_features import ML_FEATURE_SCHEMA_VERSION, ML_FEATURES_V1
from app.registry.artifact_store import ArtifactStore
from app.registry.metadata import ModelMetadata
from app.inference.loader import ModelLoader
from app.training.preprocessing import native_preprocessor


class _FakeProbabilityEstimator:
    def predict_proba(self, X):
        return np.tile(np.array([0.3, 0.7]), (len(X), 1))


TEST_TOKEN = "test-service-token"
MODEL_VERSION = "test-raisedNewRoundWithin12Months-12m-catboost-20260101000000"


@pytest.fixture
def client(tmp_path):
    store = ArtifactStore(str(tmp_path))
    metadata = ModelMetadata(
        model_version=MODEL_VERSION, target_name="raisedNewRoundWithin12Months", target_version="v1",
        feature_schema_version=ML_FEATURE_SCHEMA_VERSION, algorithm="catboost", prediction_type="PROBABILITY",
        feature_cols=ML_FEATURES_V1, training_rows=10, validation_rows=2, test_rows=2, is_test_only=True,
    )
    store.save(_FakeProbabilityEstimator(), native_preprocessor(), metadata)

    original_loader, original_token = app.state.loader, app.state.settings.ml_service_token
    app.state.loader = ModelLoader(store)
    app.state.settings.ml_service_token = TEST_TOKEN
    try:
        yield TestClient(app)
    finally:
        app.state.loader = original_loader
        app.state.settings.ml_service_token = original_token


def _predict_body(model_version: str = MODEL_VERSION, feature_schema_version: str = ML_FEATURE_SCHEMA_VERSION) -> dict:
    return {"startupId": "s1", "snapshotAt": "2026-01-01T00:00:00Z", "featureSchemaVersion": feature_schema_version, "features": {"annualRevenue": 500000}, "modelVersion": model_version}


def test_health_requires_no_auth(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["modelsAvailable"] == 1


def test_predict_rejects_missing_token(client):
    res = client.post("/predict", json=_predict_body())
    assert res.status_code == 401


def test_predict_rejects_wrong_token(client):
    res = client.post("/predict", json=_predict_body(), headers={"Authorization": "Bearer wrong-token"})
    assert res.status_code == 401


def test_predict_succeeds_with_correct_token(client):
    res = client.post("/predict", json=_predict_body(), headers={"Authorization": f"Bearer {TEST_TOKEN}"})
    assert res.status_code == 200
    body = res.json()
    assert body["predictionType"] == "PROBABILITY"
    assert 0 <= body["prediction"] <= 1


def test_predict_rejects_unknown_model_version(client):
    res = client.post("/predict", json=_predict_body(model_version="does-not-exist"), headers={"Authorization": f"Bearer {TEST_TOKEN}"})
    assert res.status_code == 404


def test_predict_rejects_feature_schema_mismatch(client):
    res = client.post("/predict", json=_predict_body(feature_schema_version="ML-FEATURES-0.1-OLD"), headers={"Authorization": f"Bearer {TEST_TOKEN}"})
    assert res.status_code == 409


def test_predict_batch_records_per_model_errors_without_failing_the_whole_batch(client):
    body = {"startupId": "s1", "snapshotAt": "2026-01-01T00:00:00Z", "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION, "features": {}, "modelVersions": [MODEL_VERSION, "unknown-model"]}
    res = client.post("/predict/batch", json=body, headers={"Authorization": f"Bearer {TEST_TOKEN}"})
    assert res.status_code == 200
    payload = res.json()
    assert len(payload["predictions"]) == 1
    assert len(payload["errors"]) == 1
    assert payload["errors"][0]["modelVersion"] == "unknown-model"


def test_predict_fails_closed_when_service_token_unset(client):
    app.state.settings.ml_service_token = ""
    res = client.post("/predict", json=_predict_body(), headers={"Authorization": f"Bearer {TEST_TOKEN}"})
    assert res.status_code == 503
