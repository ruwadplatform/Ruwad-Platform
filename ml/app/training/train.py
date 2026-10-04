"""Training CLI — the ONLY way to train a model in this project. No public
HTTP endpoint triggers training (see docs/ml-training-methodology.md).

    python -m app.training.train --target raisedNewRoundWithin12Months
    python -m app.training.train --target raisedNewRoundWithin12Months --algorithms catboost,xgboost
    python -m app.training.train --target raisedNewRoundWithin12Months --test-only

Real runs ALWAYS check the readiness gate first and refuse to train if it
isn't satisfied — printing exactly why, never training on
insufficient/fake data. `--test-only` is the ONE flag that skips the gate,
and it also switches the dataset source to the synthetic TEST_ONLY fixture
under tests/fixtures/ — never the real export endpoint — and force-tags
every resulting training run and model TEST_ONLY.
"""
from __future__ import annotations

import argparse
import sys
import traceback
from datetime import datetime, timezone

import pandas as pd

from ..config import get_settings
from ..ml_features import ML_FEATURE_SCHEMA_VERSION, ML_FEATURES_V1
from ..registry.artifact_store import ArtifactStore
from ..registry.metadata import ModelMetadata
from ..registry.registry import build_model_version, register_trained_model
from ..ruwad_client import RuwadClient
from .baselines import train_baselines
from .calibrate import fit_calibration
from .compare import build_comparison_table, print_comparison_table
from .dataset import Dataset, load_dataset
from .evaluate import evaluate_classification, evaluate_regression
from .explain import explain_tree_model
from .model_types import TrainedModel
from .splits import SplitResult, temporal_group_split
from .target_types import TargetType, fetch_target_meta
from ..validation.leakage import assert_no_future_leakage_in_features  # noqa: F401  (re-exported for callers/tests)

DEFAULT_ALGORITHMS = ["baseline", "catboost", "xgboost"]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train a RUWĀD ML target model")
    p.add_argument("--target", required=True, help="Target name, e.g. raisedNewRoundWithin12Months")
    p.add_argument("--algorithms", default=",".join(DEFAULT_ALGORITHMS), help="Comma-separated: baseline,catboost,xgboost,lightgbm")
    p.add_argument("--test-only", action="store_true", help="Use the synthetic TEST_ONLY fixture and skip the readiness gate")
    p.add_argument("--min-confidence", type=float, default=None)
    p.add_argument("--verified-only", action="store_true")
    p.add_argument("--created-by", default="cli")
    return p.parse_args(argv)


def _load_real_dataset(client: RuwadClient, target_meta, *, min_confidence: float | None, verified_only: bool) -> Dataset:
    from ..validation.readiness import require_ready

    require_ready(client, target_meta.name)  # raises DatasetNotReadyError if not ready — caller handles it
    return load_dataset(client, target_meta, min_confidence=min_confidence, verified_only=verified_only)


def _load_synthetic_dataset(target_meta) -> Dataset:
    # Imported lazily and ONLY on --test-only — production code never
    # imports the tests package.
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2]))
    from tests.fixtures.synthetic_dataset import build_synthetic_dataset  # type: ignore

    df = build_synthetic_dataset(target_meta)
    feature_cols = [c for c in ML_FEATURES_V1 if c in df.columns]
    return Dataset(df=df, feature_cols=feature_cols, target_col=f"target_{target_meta.name}", target_meta=target_meta, warnings=[])


def _train_requested_algorithms(algorithms: list[str], split: SplitResult, feature_cols: list[str], target_col: str, target_type: TargetType, *, random_seed: int) -> list[TrainedModel]:
    models: list[TrainedModel] = []
    if "baseline" in algorithms:
        models.extend(train_baselines(split.train, feature_cols, target_col, target_type, random_seed=random_seed))
    if "catboost" in algorithms:
        from .catboost_model import train_catboost
        models.append(train_catboost(split.train, split.val, feature_cols, target_col, target_type, random_seed=random_seed))
    if "xgboost" in algorithms:
        from .xgboost_model import train_xgboost
        models.append(train_xgboost(split.train, split.val, feature_cols, target_col, target_type, random_seed=random_seed))
    if "lightgbm" in algorithms:
        from .lightgbm_model import train_lightgbm
        models.append(train_lightgbm(split.train, split.val, feature_cols, target_col, target_type, random_seed=random_seed))
    return models


def train(args: argparse.Namespace) -> int:
    settings = get_settings()
    client = RuwadClient(settings)
    algorithms = [a.strip() for a in args.algorithms.split(",") if a.strip()]
    started_at = datetime.now(timezone.utc)

    target_meta = None
    try:
        target_meta = fetch_target_meta(client, args.target)
        if args.test_only:
            dataset = _load_synthetic_dataset(target_meta)
        else:
            dataset = _load_real_dataset(client, target_meta, min_confidence=args.min_confidence, verified_only=args.verified_only)
    except Exception as e:  # readiness-gate / fetch failures land here
        from ..validation.readiness import DatasetNotReadyError

        if isinstance(e, DatasetNotReadyError):
            print(str(e))
            client.record_training_run({
                "targetName": args.target, "targetVersion": target_meta.target_version if target_meta else "unknown", "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION,
                "algorithm": ",".join(algorithms), "status": "BLOCKED_NOT_READY", "startedAt": started_at.isoformat(),
                "completedAt": datetime.now(timezone.utc).isoformat(), "errorMessage": str(e), "createdBy": args.created_by, "isTestOnly": False,
            })
            return 1
        print(f"Dataset load failed: {e}")
        traceback.print_exc()
        return 1

    if dataset.warnings:
        for w in dataset.warnings:
            print(f"WARNING: {w}")

    for w in dataset.warnings:
        print(f"[data quality] {w}")

    split = temporal_group_split(dataset.df)
    print(f"Split: train={len(split.train)} val={len(split.val)} test={len(split.test)}")

    try:
        trained = _train_requested_algorithms(algorithms, split, dataset.feature_cols, dataset.target_col, dataset.target_meta.target_type, random_seed=settings.random_seed)
    except Exception as e:
        print(f"Training failed: {e}")
        traceback.print_exc()
        client.record_training_run({
            "targetName": args.target, "targetVersion": dataset.target_meta.target_version, "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION,
            "algorithm": ",".join(algorithms), "status": "FAILED", "startedAt": started_at.isoformat(),
            "completedAt": datetime.now(timezone.utc).isoformat(), "datasetRows": len(dataset.df), "errorMessage": str(e)[:2000],
            "createdBy": args.created_by, "isTestOnly": args.test_only,
        })
        return 1

    comparison_rows = []
    store = ArtifactStore(settings.artifact_dir)
    registered: list[str] = []

    for model in trained:
        val_pred = model.predict(split.val) if len(split.val) else model.predict(split.train)
        test_pred = model.predict(split.test) if len(split.test) else val_pred

        if dataset.target_meta.target_type is TargetType.CLASSIFICATION:
            val_metrics = evaluate_classification(split.val[dataset.target_col].to_numpy(), val_pred) if len(split.val) else None
            test_metrics = evaluate_classification((split.test[dataset.target_col] if len(split.test) else split.val[dataset.target_col]).to_numpy(), test_pred)
        else:
            val_metrics = evaluate_regression(split.val[dataset.target_col].to_numpy(), val_pred) if len(split.val) else None
            test_metrics = evaluate_regression((split.test[dataset.target_col] if len(split.test) else split.val[dataset.target_col]).to_numpy(), test_pred)

        comparison_rows.append((model, test_metrics))

        metrics_payload: dict = {"test": test_metrics.to_dict()}
        if val_metrics:
            metrics_payload["validation"] = val_metrics.to_dict()

        if dataset.target_meta.target_type is TargetType.CLASSIFICATION and len(split.val) and model.algorithm not in ("baseline-majority-class",):
            calib = fit_calibration(split.val[dataset.target_col].to_numpy(), val_pred, method="isotonic")
            metrics_payload["calibration"] = {"method": calib.method, "eceBefore": calib.ece_before, "eceAfter": calib.ece_after}

        if model.algorithm in ("catboost", "xgboost", "lightgbm"):
            explanation = explain_tree_model(model, split.train)
            metrics_payload["explainability"] = explanation.to_dict()

        # Baselines are reported for comparison only — never registered as
        # a deployable candidate (see train.py's own module docstring /
        # docs/ml-training-methodology.md).
        if model.algorithm.startswith("baseline-"):
            continue

        model_version = build_model_version(args.target, dataset.target_meta.window_months, model.algorithm, is_test_only=args.test_only)
        metadata = ModelMetadata(
            model_version=model_version, target_name=args.target, target_version=dataset.target_meta.target_version,
            feature_schema_version=ML_FEATURE_SCHEMA_VERSION, algorithm=model.algorithm,
            prediction_type="PROBABILITY" if dataset.target_meta.target_type is TargetType.CLASSIFICATION else "REGRESSION_VALUE",
            hyperparameters={k: v for k, v in model.hyperparameters.items() if isinstance(v, (int, float, str, bool, type(None)))},
            feature_cols=model.feature_cols, categorical_cols=getattr(model.preprocessor, "categorical_cols", []),
            training_rows=len(split.train), validation_rows=len(split.val), test_rows=len(split.test),
            metrics=metrics_payload, is_test_only=args.test_only, trained_at=datetime.now(timezone.utc).isoformat(),
        )
        try:
            register_trained_model(
                store, client, estimator=model.estimator, preprocessor=model.preprocessor, metadata=metadata,
                training_period_start=pd.to_datetime(split.train["snapshotAt"]).min().isoformat() if len(split.train) else None,
                training_period_end=pd.to_datetime(split.test["snapshotAt"] if len(split.test) else split.train["snapshotAt"]).max().isoformat(),
            )
            registered.append(model_version)
        except Exception as e:  # noqa: BLE001 — a registration failure must not lose the already-trained artifact
            print(f"WARNING: model '{model_version}' trained and saved locally, but registering it with the backend failed: {e}")

    print_comparison_table(build_comparison_table(comparison_rows))

    client.record_training_run({
        "targetName": args.target, "targetVersion": dataset.target_meta.target_version, "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION,
        "algorithm": ",".join(algorithms), "status": "COMPLETED", "startedAt": started_at.isoformat(),
        "completedAt": datetime.now(timezone.utc).isoformat(), "datasetRows": len(dataset.df),
        "metrics": {"registeredModels": registered}, "modelVersion": registered[0] if registered else None,
        "artifactLocation": registered[0] if registered else None, "createdBy": args.created_by, "isTestOnly": args.test_only,
    })

    print(f"\nRegistered model versions: {registered or '(none — baselines only)'}")
    return 0


def main() -> None:
    sys.exit(train(parse_args()))


if __name__ == "__main__":
    main()
