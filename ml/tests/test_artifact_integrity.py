"""Production artifact integrity, readiness and surface area. Uses a small synthetic model for the mechanics, and the REAL committed artifact
(ml/model_artifacts + ml/model_manifest.json) for the guard that the repository itself has not drifted."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import ML_DIR, Settings
from app.inference.integrity import load_manifest, verify_model
from app.inference.package_artifact import coarse_profile, package
from app.main import app, build_loader
from app.ml_features import ML_FEATURE_SCHEMA_VERSION
from app.registry.artifact_store import ArtifactStore
from app.registry.metadata import ModelMetadata
from app.training.baselines import train_logistic_regression_baseline

TOKEN = "integrity-test-token"
COLS = ["customerCount", "fundingRounds", "founderCount", "teamSize"]
TARGET = "target_raisedNewRoundWithin6Months"
V = "exp-raisedNewRoundWithin6Months-6m-logistic-regression-20260101000000"
OTHER = "exp-raisedNewRoundWithin6Months-6m-logistic-regression-20260202000000"
REAL_V = "exp-raisedNewRoundWithin6Months-6m-catboost-20261004070745"
GOOD = {"fundingRounds": 1, "teamSize": 20, "founderCount": 2}


def _df():
    rng = np.random.default_rng(0)
    n = 40
    df = pd.DataFrame({"customerCount": rng.integers(10, 1000, n).astype(float), "fundingRounds": rng.integers(0, 4, n).astype(float), "founderCount": rng.integers(1, 4, n).astype(float), "teamSize": rng.integers(2, 60, n).astype(float)})
    df[TARGET] = (df["teamSize"] + 10 * df["fundingRounds"] > 45).astype(int)
    return df


def _train_into(store: ArtifactStore, version: str, experimental: bool = True):
    df = _df()
    m = train_logistic_regression_baseline(df, COLS, TARGET)
    md = ModelMetadata(model_version=version, target_name="raisedNewRoundWithin6Months", target_version="FUNDING-6M-v1", feature_schema_version=ML_FEATURE_SCHEMA_VERSION, algorithm=m.algorithm,
                       feature_cols=COLS, training_rows=15, is_experimental=experimental, metrics={"datasetVersion": "TEST", "datasetSha256": "abc", "positiveCount": 4, "negativeCount": 11})
    store.save(m.estimator, m.preprocessor, md)
    store.write_profile(version, {"datasetVersion": "TEST", "datasetSha256": "abc", "rows": 15, "createdAt": "x", "features": {c: {"count": 10, "min": float(df[c].min()), "max": float(df[c].max())} for c in COLS}})


@pytest.fixture
def prod(tmp_path):
    src = ArtifactStore(str(tmp_path / "src"))
    _train_into(src, V)
    dest = tmp_path / "packaged"
    manifest = tmp_path / "manifest.json"
    package(Path(src.base_dir), dest, V, manifest)
    return {"dest": dest, "manifest": manifest, "tmp": tmp_path}


def _settings(prod_, version=V, **over):
    return Settings(artifact_dir=str(prod_["dest"]), model_manifest_path=str(prod_["manifest"]), require_verified_artifacts=True, ml_experimental_model_version=version, ml_service_token=TOKEN, **over)


@pytest.fixture
def client(prod):
    def make(version=V):
        cfg = _settings(prod, version)
        old = (app.state.settings, app.state.loader)
        app.state.settings = cfg
        app.state.loader = build_loader(cfg, ArtifactStore(cfg.artifact_dir))
        return TestClient(app), old
    made = []
    def factory(version=V):
        c, old = make(version)
        made.append(old)
        return c
    yield factory
    if made:
        app.state.settings, app.state.loader = made[0]


def _post(c, body, token=TOKEN):
    return c.post("/predict/experimental", json=body, headers={"Authorization": f"Bearer {token}"})


def _body(model=V, features=None):
    return {"startupId": "s1", "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION, "features": features or GOOD, "modelVersion": model}


# ---- verification ----
def test_an_untouched_packaged_artifact_verifies(prod):
    r = verify_model(prod["dest"], load_manifest(prod["manifest"]), V)
    assert r.ok and r.problems == []


def test_verification_does_not_depend_on_line_endings(prod):
    """Windows git (autocrlf) checks JSON out with CRLF, Linux with LF: the same artifact must verify on both."""
    manifest = load_manifest(prod["manifest"])
    for name in ("metadata.json", "training_profile.json"):
        path = prod["dest"] / V / name
        path.write_bytes(path.read_bytes().replace(b"\n", b"\r\n"))
    assert verify_model(prod["dest"], manifest, V).ok
    # ...but a real content change is still caught
    path = prod["dest"] / V / "training_profile.json"
    path.write_bytes(path.read_bytes().replace(b"15", b"16"))
    assert not verify_model(prod["dest"], manifest, V).ok


def test_the_committed_json_files_use_lf_and_are_pinned_against_conversion():
    d = ML_DIR / "model_artifacts" / REAL_V
    for name in ("metadata.json", "training_profile.json"):
        assert b"\r\n" not in (d / name).read_bytes(), f"{name} must be committed with LF line endings"
    assert b"\r\n" not in (ML_DIR / "model_manifest.json").read_bytes()
    attrs = (ML_DIR / ".gitattributes").read_text()
    assert "model_artifacts/** -text" in attrs


def test_the_packaged_files_are_byte_identical_to_the_trained_ones(prod):
    src = prod["tmp"] / "src" / V
    for name in ("estimator.joblib", "preprocessor.joblib"):
        assert (src / name).read_bytes() == (prod["dest"] / V / name).read_bytes()
    assert (src / "metadata.json").read_bytes().replace(b"\r\n", b"\n") == (prod["dest"] / V / "metadata.json").read_bytes()


def test_a_tampered_estimator_fails_verification_and_is_never_unpickled(prod, monkeypatch):
    (prod["dest"] / V / "estimator.joblib").write_bytes(b"not the model")
    cfg = _settings(prod)
    store = ArtifactStore(cfg.artifact_dir)
    called = []
    monkeypatch.setattr(store, "load", lambda v: called.append(v))
    loader = build_loader(cfg, store)
    assert loader.get(V) is None
    assert called == [], "a pickle must never be loaded before its hash has been verified"
    assert any("estimator.joblib" in p and "mismatch" in p for p in loader.verification[V].problems)


@pytest.mark.parametrize("key,value,expected", [("targetVersion", "FUNDING-12M-v9", "targetVersion"), ("featureSchemaVersion", "ML-FEATURES-9.9", "featureSchemaVersion"), ("modelVersion", "someone-else", "modelVersion")])
def test_identity_fields_must_match_the_manifest(prod, key, value, expected):
    path = prod["dest"] / V / "metadata.json"
    md = json.loads(path.read_text())
    md[key] = value
    path.write_text(json.dumps(md))
    r = verify_model(prod["dest"], load_manifest(prod["manifest"]), V)
    assert not r.ok and any(expected in p or "metadata.json" in p for p in r.problems)


def test_manifest_missing_unknown_version_and_extra_files_all_fail_safely(prod, tmp_path):
    assert not verify_model(prod["dest"], None, V).ok
    assert "not in the manifest" in verify_model(prod["dest"], load_manifest(prod["manifest"]), OTHER).problems[0]
    (prod["dest"] / V / "extra.joblib").write_bytes(b"x")
    assert any("unexpected files" in p for p in verify_model(prod["dest"], load_manifest(prod["manifest"]), V).problems)
    assert load_manifest(tmp_path / "nope.json") is None
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    assert load_manifest(bad) is None


def test_packaging_refuses_a_non_experimental_model_and_never_overwrites_a_pinned_one(tmp_path):
    src = ArtifactStore(str(tmp_path / "src"))
    _train_into(src, "prod-model-1", experimental=False)
    with pytest.raises(SystemExit):
        package(Path(src.base_dir), tmp_path / "d", "prod-model-1", tmp_path / "m.json")
    _train_into(src, V)
    package(Path(src.base_dir), tmp_path / "d", V, tmp_path / "m.json")
    package(Path(src.base_dir), tmp_path / "d", V, tmp_path / "m.json")  # same bytes: idempotent
    (Path(src.base_dir) / V / "estimator.joblib").write_bytes(b"different model, same version")
    with pytest.raises(SystemExit):
        package(Path(src.base_dir), tmp_path / "d", V, tmp_path / "m.json")


def test_the_packaged_profile_does_not_carry_exact_company_values():
    exact = {"features": {"customerCount": {"count": 3, "min": 50000.0, "max": 250000.0}, "founderCount": {"count": 10, "min": 1.0, "max": 3.0}}, "createdAt": "now"}
    c = coarse_profile(exact)
    assert c["features"]["customerCount"] == {"count": 3, "min": 20000.0, "max": 500000.0}
    assert c["features"]["founderCount"]["min"] == 0.5 and c["features"]["founderCount"]["max"] == 6.0
    assert "createdAt" not in c


# ---- readiness (/health) ----
def test_health_is_ready_only_when_the_configured_model_is_verified_and_loaded(client):
    r = client().get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["modelLoaded"] is True and body["artifactVerified"] is True
    assert body["modelVersion"] == V and body["statusType"] == "EXPERIMENTAL"
    assert body["featureSchemaVersion"] == ML_FEATURE_SCHEMA_VERSION and body["targetVersion"] == "FUNDING-6M-v1"


def test_health_reports_not_ready_with_503_when_the_artifact_is_tampered(client, prod):
    (prod["dest"] / V / "preprocessor.joblib").write_bytes(b"tampered")
    r = client().get("/health")
    assert r.status_code == 503 and r.json()["status"] == "degraded" and r.json()["modelLoaded"] is False and r.json()["artifactVerified"] is False


def test_health_is_not_ready_when_no_model_is_configured_or_it_is_not_in_the_manifest(client):
    assert client("").get("/health").status_code == 503
    assert client(OTHER).get("/health").status_code == 503


def test_health_never_leaks_paths_or_secrets(client, prod):
    text = client().get("/health").text
    assert TOKEN not in text and str(prod["tmp"]) not in text and "estimator.joblib" not in text and "sha" not in text.lower()


# ---- surface area ----
def test_production_serves_only_the_configured_model_and_predicts_with_it(client):
    c = client()
    ok = _post(c, _body()).json()
    assert ok["status"] == "OK" and ok["modelStatus"] == "EXPERIMENTAL" and 0 <= ok["prediction"] <= 1
    assert _post(c, _body(model=OTHER)).status_code == 404


def test_a_tampered_artifact_cannot_predict_at_all(client, prod):
    (prod["dest"] / V / "estimator.joblib").write_bytes(b"tampered")
    assert _post(client(), _body()).status_code == 404


def test_predict_still_requires_the_service_token_in_production_mode(client):
    c = client()
    assert c.post("/predict/experimental", json=_body()).status_code == 401
    assert _post(c, _body(), token="wrong").status_code == 401


def test_the_models_listing_is_no_longer_anonymous(client):
    c = client()
    assert c.get("/models").status_code == 401
    assert c.get("/models", headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 200


def test_there_is_no_training_or_admin_route():
    paths = {getattr(r, "path", "") for r in app.routes}
    assert not [p for p in paths if re.search(r"train|fit|upload|artifact|admin", p)], paths


def test_interactive_docs_are_off_in_production_mode(tmp_path):
    code = ("import os;os.environ['REQUIRE_VERIFIED_ARTIFACTS']='true';from app.main import app;"
            "print(app.openapi_url, app.docs_url, app.redoc_url)")
    out = subprocess.run([sys.executable, "-c", code], cwd=str(ML_DIR), capture_output=True, text=True, timeout=120).stdout.strip().splitlines()[-1]
    assert out == "None None None"


# ---- the REAL committed artifact ----
def test_the_committed_artifact_matches_the_committed_manifest():
    manifest = load_manifest(ML_DIR / "model_manifest.json")
    assert manifest is not None and REAL_V in manifest["models"]
    entry = manifest["models"][REAL_V]
    assert entry["status"] == "EXPERIMENTAL" and entry["isExperimental"] is True and "no statistical winner" in entry["selection"].lower()
    r = verify_model(ML_DIR / "model_artifacts", manifest, REAL_V)
    assert r.ok, r.problems


def test_the_committed_artifact_holds_no_rows_or_identifiers():
    d = ML_DIR / "model_artifacts" / REAL_V
    assert sorted(p.name for p in d.iterdir()) == ["estimator.joblib", "metadata.json", "preprocessor.joblib", "training_profile.json"]
    assert sum(p.stat().st_size for p in d.iterdir()) < 100_000
    for name in ("metadata.json", "training_profile.json"):
        text = (d / name).read_text()
        assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-", text), f"{name} contains a UUID"
        assert "@" not in text and "pitchbook" not in text.lower() and "csv" not in text.lower().replace("datasetsha256", "")
    md = json.loads((d / "metadata.json").read_text())
    assert md["isExperimental"] is True and md["metrics"]["mlWeight"] == 0 and md["metrics"]["publicScoreInfluence"] is False
    assert md["trainingRows"] == 15 and md["metrics"]["positiveCount"] == 4 and md["metrics"]["negativeCount"] == 11


def test_the_committed_artifact_serves_a_prediction_in_production_mode(tmp_path):
    cfg = Settings(artifact_dir=str(ML_DIR / "model_artifacts"), model_manifest_path=str(ML_DIR / "model_manifest.json"), require_verified_artifacts=True, ml_experimental_model_version=REAL_V, ml_service_token=TOKEN)
    old = (app.state.settings, app.state.loader)
    app.state.settings, app.state.loader = cfg, build_loader(cfg, ArtifactStore(cfg.artifact_dir))
    try:
        c = TestClient(app)
        h = c.get("/health")
        assert h.status_code == 200 and h.json()["modelLoaded"] is True and h.json()["artifactVerified"] is True
        r = _post(c, _body(model=REAL_V, features={"fundingRounds": 1, "teamSize": 20, "founderCount": 2})).json()
        assert r["status"] == "OK" and r["algorithm"] == "catboost" and r["trainingRows"] == 15 and r["reliability"] in ("VERY_LOW", "LOW")
        thin = _post(c, _body(model=REAL_V, features={"teamSize": 20})).json()
        assert thin["status"] == "INSUFFICIENT_DATA" and thin["prediction"] is None
    finally:
        app.state.settings, app.state.loader = old
