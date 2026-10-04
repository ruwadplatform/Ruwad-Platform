from __future__ import annotations

import pytest

from app.training.target_types import TargetMeta, TargetType
from tests.fixtures.synthetic_dataset import build_synthetic_dataset


@pytest.fixture
def classification_target_meta() -> TargetMeta:
    return TargetMeta(name="raisedNewRoundWithin12Months", group="funding", target_version="v1", window_months=12, target_type=TargetType.CLASSIFICATION)


@pytest.fixture
def regression_target_meta() -> TargetMeta:
    return TargetMeta(name="revenueGrowthWithin12Months", group="growth", target_version="v1", window_months=12, target_type=TargetType.REGRESSION)


@pytest.fixture
def synthetic_df_classification(classification_target_meta: TargetMeta):
    return build_synthetic_dataset(classification_target_meta, n_startups=60, seed=1)


@pytest.fixture
def synthetic_df_regression(regression_target_meta: TargetMeta):
    return build_synthetic_dataset(regression_target_meta, n_startups=60, seed=2)


class FakeRuwadClient:
    """Stand-in for RuwadClient in tests that shouldn't need a live NestJS
    backend — only implements the methods each test actually calls."""

    def __init__(self, targets=None, readiness=None, export_rows=None):
        self._targets = targets or []
        self._readiness = readiness or {}
        self._export_rows = export_rows or []
        self.registered_models: list[dict] = []
        self.recorded_runs: list[dict] = []

    def fetch_targets(self):
        return self._targets

    def fetch_readiness(self, target: str):
        return self._readiness[target]

    def fetch_export(self, target: str, *, min_confidence=None, verified_only=False, include_identifiers=True):
        return self._export_rows

    def register_model(self, payload: dict):
        self.registered_models.append(payload)
        return {"id": f"fake-{len(self.registered_models)}", **payload}

    def record_training_run(self, payload: dict):
        self.recorded_runs.append(payload)
        return {"id": f"fake-run-{len(self.recorded_runs)}", **payload}


@pytest.fixture
def fake_client() -> FakeRuwadClient:
    return FakeRuwadClient()
