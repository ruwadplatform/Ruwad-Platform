"""Live experimental inference endpoint. The tiny models here are trained on synthetic frames purely to exercise the SERVING code
(gates, auth, status handling); they are never registered anywhere."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.inference.loader import ModelLoader
from app.main import app
from app.ml_features import ML_FEATURE_SCHEMA_VERSION
from app.registry.artifact_store import ArtifactStore
from app.registry.metadata import ModelMetadata
from app.training.baselines import train_logistic_regression_baseline
from app.training.catboost_model import train_catboost
from app.training.target_types import TargetType

TOKEN = "test-service-token"
COLS = ["customerCount", "fundingRounds", "founderCount", "teamSize"]
TARGET = "target_raisedNewRoundWithin6Months"
EXP_LR = "exp-raisedNewRoundWithin6Months-6m-logistic-regression-20260101000000"
EXP_CB = "exp-raisedNewRoundWithin6Months-6m-catboost-20260101000000"
PROD = "raisedNewRoundWithin6Months-6m-xgboost-20260101000000"


def _train_df():
    rng = np.random.default_rng(0)
    n = 40
    df = pd.DataFrame({"customerCount": rng.integers(10, 1000, n).astype(float), "fundingRounds": rng.integers(0, 4, n).astype(float), "founderCount": rng.integers(1, 4, n).astype(float), "teamSize": rng.integers(2, 60, n).astype(float)})
    df.loc[rng.random(n) < 0.4, "customerCount"] = np.nan
    df[TARGET] = (df["teamSize"] + 10 * df["fundingRounds"].fillna(0) > 45).astype(int)
    return df


def _profile(df):
    return {"datasetVersion": "TEST", "rows": len(df), "features": {c: {"count": int(df[c].notna().sum()), "min": float(df[c].min()), "max": float(df[c].max())} for c in COLS}}


@pytest.fixture
def client(tmp_path):
    df = _train_df()
    store = ArtifactStore(str(tmp_path))

    def save(version, model, experimental, with_profile=True):
        md = ModelMetadata(model_version=version, target_name="raisedNewRoundWithin6Months", target_version="FUNDING-6M-v1", feature_schema_version=ML_FEATURE_SCHEMA_VERSION,
                           algorithm=model.algorithm, feature_cols=COLS, categorical_cols=[], training_rows=15, is_experimental=experimental, metrics={"positiveCount": 4, "negativeCount": 11, "datasetVersion": "TEST"})
        store.save(model.estimator, model.preprocessor, md)
        if with_profile:
            store.write_profile(version, _profile(df))

    save(EXP_LR, train_logistic_regression_baseline(df, COLS, TARGET), True)
    save(EXP_CB, train_catboost(df, df.iloc[0:0], COLS, TARGET, TargetType.CLASSIFICATION, params={"iterations": 30, "depth": 2, "early_stopping_rounds": None}), True)
    save(PROD, train_logistic_regression_baseline(df, COLS, TARGET), False)

    old_loader, old_token = app.state.loader, app.state.settings.ml_service_token
    app.state.loader = ModelLoader(store)
    app.state.settings.ml_service_token = TOKEN
    try:
        yield TestClient(app)
    finally:
        app.state.loader = old_loader
        app.state.settings.ml_service_token = old_token


def _body(features, model=EXP_LR, schema=ML_FEATURE_SCHEMA_VERSION):
    return {"startupId": "s1", "featureSchemaVersion": schema, "features": features, "modelVersion": model}


def _post(client, body, token=TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    return client.post("/predict/experimental", json=body, headers=headers)


GOOD = {"fundingRounds": 1, "teamSize": 20, "founderCount": 2}


# ---- service authentication ----
def test_public_access_without_a_token_is_rejected(client):
    assert _post(client, _body(GOOD), token=None).status_code == 401


def test_a_wrong_token_is_rejected(client):
    assert _post(client, _body(GOOD), token="wrong").status_code == 401


def test_when_no_token_is_configured_the_service_never_predicts(client):
    app.state.settings.ml_service_token = ""
    assert _post(client, _body(GOOD), token=TOKEN).status_code == 503


def test_health_stays_open_but_exposes_no_prediction(client):
    r = client.get("/health")
    assert r.status_code == 200 and "prediction" not in r.text


# ---- model gating ----
def test_a_missing_model_artifact_is_a_controlled_404(client):
    assert _post(client, _body(GOOD, model="exp-does-not-exist")).status_code == 404


def test_schema_mismatch_is_rejected_with_409(client):
    r = _post(client, _body(GOOD, schema="ML-FEATURES-0.1-OLD"))
    assert r.status_code == 409 and "schema" in r.json()["detail"].lower()


def test_a_non_experimental_model_cannot_be_served_here(client):
    r = _post(client, _body(GOOD, model=PROD))
    assert r.status_code == 409 and "EXPERIMENTAL" in r.json()["detail"]


def test_the_generic_predict_paths_refuse_an_experimental_model(client):
    body = {"startupId": "s1", "snapshotAt": "2026-01-01T00:00:00Z", "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION, "features": GOOD, "modelVersion": EXP_LR}
    h = {"Authorization": f"Bearer {TOKEN}"}
    assert client.post("/predict", json=body, headers=h).status_code == 409
    batch = client.post("/predict/batch", json={**{k: v for k, v in body.items() if k != "modelVersion"}, "modelVersions": [EXP_LR]}, headers=h).json()
    assert batch["predictions"] == [] and "EXPERIMENTAL" in batch["errors"][0]["error"]


# ---- minimum-data gate ----
@pytest.mark.parametrize("features", [{}, {"teamSize": 20}, {"annualRevenue": 1_000_000, "tam": 5e9}])
def test_too_few_model_features_returns_insufficient_data_and_no_number(client, features):
    r = _post(client, _body(features)).json()
    assert r["status"] == "INSUFFICIENT_DATA"
    assert r["prediction"] is None and r["reliability"] is None  # never a 50% fallback
    assert r["reasons"]


def test_non_model_features_are_ignored_not_counted(client):
    r = _post(client, _body({"teamSize": 20, "annualRevenue": 9e6, "tam": 1e9})).json()
    assert r["status"] == "INSUFFICIENT_DATA" and r["populatedFeatures"] == ["teamSize"]


@pytest.mark.parametrize("bad", [-5, "lots"])
def test_invalid_values_are_rejected_not_predicted(client, bad):
    r = _post(client, _body({"fundingRounds": 1, "teamSize": bad, "founderCount": 2})).json()
    assert r["status"] == "INSUFFICIENT_DATA" and r["invalidFeatures"] == ["teamSize"] and r["prediction"] is None


# ---- a real prediction ----
@pytest.mark.parametrize("model", [EXP_LR, EXP_CB])
def test_a_valid_input_returns_a_labelled_experimental_estimate(client, model):
    r = _post(client, _body(GOOD, model=model)).json()
    assert r["status"] == "OK" and 0 <= r["prediction"] <= 1
    assert r["modelStatus"] == "EXPERIMENTAL" and r["predictionType"] == "PROBABILITY"
    assert r["calibration"] == "NOT_RELIABLE_AT_CURRENT_SAMPLE_SIZE"
    assert r["trainingRows"] == 15 and r["trainingPositives"] == 4 and r["trainingNegatives"] == 11
    assert any("Not used in the RUWAD Score" in w for w in r["warnings"])
    assert r["populatedFeatures"] == sorted(GOOD) and r["featureCompleteness"] == 0.75


def test_reliability_is_never_above_low_and_drops_to_very_low_when_input_is_thin_or_unfamiliar(client):
    thin = _post(client, _body({"fundingRounds": 1, "teamSize": 20})).json()  # 2 of 4 features = 50% -> LOW (>=0.43)
    assert thin["reliability"] in ("LOW", "VERY_LOW") and thin["reliability"] != "HIGH"
    far = _post(client, _body({"fundingRounds": 1, "teamSize": 5000, "founderCount": 2})).json()  # far outside the training range
    assert far["reliability"] == "VERY_LOW" and any("teamSize" in f for f in far["outOfRange"])


def test_a_model_without_a_training_profile_is_rated_very_low(client, tmp_path):
    store = ArtifactStore(str(tmp_path))
    (tmp_path / EXP_LR / "training_profile.json").unlink()
    app.state.loader = ModelLoader(store)
    r = _post(client, _body(GOOD)).json()
    assert r["status"] == "OK" and r["reliability"] == "VERY_LOW"


def test_tree_model_contributions_are_labelled_exploratory(client):
    r = _post(client, _body(GOOD, model=EXP_CB)).json()
    assert "Exploratory" in (r["driversNote"] or "") or r["drivers"] == []
    assert all(d["direction"] in ("UP", "DOWN") for d in r["drivers"])


def test_the_profile_sidecar_holds_aggregates_only(tmp_path):
    from app.inference.profile import build_profile

    df = _train_df()
    p = build_profile(df, {"datasetVersion": "TEST", "csvSha256": "x", "positiveCount": 4, "negativeCount": 11}, COLS)
    assert set(p["features"]["teamSize"]) == {"count", "min", "max"} and "rows" in p and not any(isinstance(v, list) for v in p.values())


def test_a_cold_process_still_answers_without_waiting_for_shap(client, monkeypatch):
    from app.inference import experimental

    started = []
    monkeypatch.setattr(experimental, "_shap_ready", lambda: False)
    monkeypatch.setattr(experimental.threading, "Thread", lambda **kw: type("T", (), {"start": lambda self: started.append(kw)})())
    r = _post(client, _body(GOOD, model=EXP_CB)).json()
    assert r["status"] == "OK" and 0 <= r["prediction"] <= 1  # the number is never held up by the optional explanation
    assert r["drivers"] == [] and "warming up" in r["driversNote"]
    assert started  # the import was kicked off in the background


def test_warm_up_never_raises_and_loads_the_models(client):
    from app.inference.experimental import warm_up

    warm_up(app.state.loader)
    assert app.state.loader.get(EXP_CB) is not None
