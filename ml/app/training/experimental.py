"""EXPERIMENTAL training on a frozen, real, training-eligible dataset.

This is NOT a production run and it never touches the production path:
  * it reads a FROZEN dataset directory (hash-verified, ELIGIBLE rows only),
    never the live export, and never synthetic rows;
  * it does not consult or bypass the production readiness gate — it has its
    own, much weaker, explicitly-labelled condition (both classes present) and
    says so in everything it writes;
  * every model it registers is `EXPERIMENTAL`: the backend refuses to promote
    it to CANDIDATE/SHADOW/ACTIVE and never serves it shadow traffic.

Evaluation at this sample size cannot be a normal train/validation/test split
(a 3-row test set means nothing). Instead it uses grouped LEAVE-ONE-STARTUP-OUT
cross-validation — every startup is held out once, so a startup's snapshots
never appear on both sides — and pools the out-of-fold predictions. Pooled
metrics are only reported when mathematically valid; per-fold metrics are not
(a held-out startup has one or two rows of one class) and are marked
NOT_EVALUABLE. Uncertainty is shown with a startup-level bootstrap. Calibration
is NOT fitted: it is unreliable at this size.

    python -m app.training.experimental --dataset datasets/RUWAD-REAL-DATASET-v1 \
        [--algorithms logistic,catboost,xgboost] [--no-register]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, f1_score, log_loss, precision_score, recall_score, roc_auc_score

from ..config import get_settings
from ..ml_features import ML_FEATURE_SCHEMA_VERSION, ML_FEATURES_V1
from ..registry.artifact_store import ArtifactStore
from ..registry.metadata import ModelMetadata
from ..registry.registry import build_model_version, register_trained_model
from ..ruwad_client import RuwadClient
from .baselines import train_logistic_regression_baseline, train_majority_class_baseline
from .explain import explain_tree_model
from .frozen_dataset import FrozenDatasetError, load_frozen_dataset
from .model_types import TrainedModel
from .target_types import TargetType

NOT_EVALUABLE = "NOT_EVALUABLE"
CALIBRATION_NOTE = "CALIBRATION NOT RELIABLE AT CURRENT SAMPLE SIZE"
# Below these, even exploratory interval estimates and calibration are not meaningful.
MIN_ROWS_FOR_CALIBRATION = 100
MIN_POSITIVES_FOR_CALIBRATION = 20

# Deliberately tiny models: with ~15 rows anything larger just memorises.
CATBOOST_PARAMS = {"iterations": 120, "depth": 3, "learning_rate": 0.05, "early_stopping_rounds": None}
XGBOOST_PARAMS = {"n_estimators": 120, "max_depth": 3, "learning_rate": 0.05, "min_child_weight": 1}

LIMITATIONS = [
    "Very small dataset: a handful of positive examples and about a dozen startups.",
    "Class imbalance: positives are a minority; precision/recall/F1 move by whole rows.",
    "Low feature coverage: most core features are missing in most rows, so models mostly learn from team size and funding history.",
    "Limited validation reliability: leave-one-startup-out on this few startups is exploratory; metrics have very wide uncertainty and no reliable ranking between models is possible.",
    "Not out-of-time: snapshots from earlier and later years are mixed across folds; negatives lean earlier and positives later, so a model can pick up on era effects.",
    "Labels depend on funding-coverage attestations of MEDIUM/HIGH confidence, not exhaustive verification.",
    "Feature importance is exploratory and unstable; it is not causal.",
]


class ExperimentalTrainingBlocked(RuntimeError):
    """Raised when the dataset cannot support even an experimental classifier."""


def check_experimental_condition(df: pd.DataFrame, target_col: str, *, group_col: str = "startupId") -> dict:
    """The ONLY gate for an experimental run: real, eligible rows with BOTH classes."""
    y = df[target_col].astype(int)
    pos, neg = int((y == 1).sum()), int((y == 0).sum())
    if pos == 0 or neg == 0:
        raise ExperimentalTrainingBlocked(f"EXPERIMENTAL TRAINING BLOCKED: single-class dataset (positive={pos}, negative={neg}). Nothing was trained.")
    if df[group_col].nunique() < 3:
        raise ExperimentalTrainingBlocked("EXPERIMENTAL TRAINING BLOCKED: fewer than 3 startups, grouped validation is impossible.")
    return {"positive": pos, "negative": neg, "startups": int(df[group_col].nunique())}


def select_feature_cols(df: pd.DataFrame) -> list[str]:
    """Allow-listed features that have at least one value in this dataset. Based on availability only, never on labels."""
    return [c for c in ML_FEATURES_V1 if c in df.columns and df[c].notna().any()]


def safe_classification_metrics(y_true: np.ndarray, y_prob: np.ndarray, *, threshold: float = 0.5) -> dict:
    """Pooled metrics, each reported only where mathematically valid."""
    y = np.asarray(y_true).astype(int)
    p = np.clip(np.asarray(y_prob, dtype=float), 1e-7, 1 - 1e-7)
    n_pos, n_neg = int((y == 1).sum()), int((y == 0).sum())
    out: dict = {"n": int(len(y)), "positives": n_pos, "negatives": n_neg, "threshold": threshold}
    if n_pos == 0 or n_neg == 0:
        reason = "single class in the evaluated rows"
        for k in ("rocAuc", "prAuc", "logLoss"):
            out[k] = NOT_EVALUABLE
        out["notEvaluableReason"] = reason
    else:
        out["rocAuc"] = float(roc_auc_score(y, p))
        out["prAuc"] = float(average_precision_score(y, p))
        out["logLoss"] = float(log_loss(y, p, labels=[0, 1]))
    out["brierScore"] = float(brier_score_loss(y, p))
    pred = (p >= threshold).astype(int)
    out["precision"] = float(precision_score(y, pred, zero_division=0)) if pred.sum() else NOT_EVALUABLE
    out["recall"] = float(recall_score(y, pred, zero_division=0)) if n_pos else NOT_EVALUABLE
    out["f1"] = float(f1_score(y, pred, zero_division=0)) if (pred.sum() and n_pos) else NOT_EVALUABLE
    out["baselinePrevalence"] = n_pos / len(y) if len(y) else None
    out["confusionMatrix"] = [[int(((y == 0) & (pred == 0)).sum()), int(((y == 0) & (pred == 1)).sum())], [int(((y == 1) & (pred == 0)).sum()), int(((y == 1) & (pred == 1)).sum())]]
    return out


def bootstrap_interval(df: pd.DataFrame, y_col: str, p_col: str, *, group_col: str = "startupId", n_boot: int = 1000, seed: int = 42) -> dict:
    """Startup-level bootstrap 95% interval for ROC-AUC and PR-AUC. Resamples whole startups; resamples with a single class are skipped (and counted)."""
    rng = np.random.default_rng(seed)
    groups = df[group_col].unique()
    by_group = {g: df[df[group_col] == g] for g in groups}
    roc, pr, skipped = [], [], 0
    for _ in range(n_boot):
        sample = pd.concat([by_group[g] for g in rng.choice(groups, size=len(groups), replace=True)])
        y = sample[y_col].to_numpy()
        if y.min() == y.max():
            skipped += 1
            continue
        roc.append(roc_auc_score(y, sample[p_col]))
        pr.append(average_precision_score(y, sample[p_col]))
    if len(roc) < 50:
        return {"status": NOT_EVALUABLE, "reason": "too few bootstrap resamples contained both classes", "validResamples": len(roc), "skippedSingleClass": skipped}
    lo, hi = np.percentile(roc, [2.5, 97.5]), np.percentile(pr, [2.5, 97.5])
    return {"status": "EXPLORATORY", "rocAuc95": [round(float(lo[0]), 3), round(float(lo[1]), 3)], "prAuc95": [round(float(hi[0]), 3), round(float(hi[1]), 3)], "validResamples": len(roc), "skippedSingleClass": skipped}


def make_trainers(feature_cols: list[str], target_col: str, seed: int) -> dict:
    def logistic(train: pd.DataFrame) -> TrainedModel:
        return train_logistic_regression_baseline(train, feature_cols, target_col, random_seed=seed)

    def majority(train: pd.DataFrame) -> TrainedModel:
        return train_majority_class_baseline(train, feature_cols, target_col)

    def catboost(train: pd.DataFrame) -> TrainedModel:
        from .catboost_model import train_catboost
        return train_catboost(train, train.iloc[0:0], feature_cols, target_col, TargetType.CLASSIFICATION, random_seed=seed, params=CATBOOST_PARAMS)

    def xgboost(train: pd.DataFrame) -> TrainedModel:
        from .xgboost_model import train_xgboost
        return train_xgboost(train, train.iloc[0:0], feature_cols, target_col, TargetType.CLASSIFICATION, random_seed=seed, params=XGBOOST_PARAMS)

    return {"majority": majority, "logistic": logistic, "catboost": catboost, "xgboost": xgboost}


def leave_one_startup_out(df: pd.DataFrame, trainer, target_col: str, *, group_col: str = "startupId") -> pd.DataFrame:
    """Out-of-fold probability for every row; a startup is never in its own training fold."""
    oof = pd.Series(index=df.index, dtype=float)
    for g in df[group_col].unique():
        test_mask = df[group_col] == g
        train = df[~test_mask]
        if train[target_col].nunique() < 2:  # a fold whose remaining rows are single-class cannot be trained
            oof[test_mask] = float(df[target_col].mean())
            continue
        model = trainer(train.reset_index(drop=True))
        oof[test_mask] = model.predict(df[test_mask].reset_index(drop=True))
    out = df[[group_col, "snapshotAt", target_col]].copy()
    out["oof"] = oof
    return out


def evaluate_algorithm(df: pd.DataFrame, trainer, target_col: str, *, seed: int) -> dict:
    oof = leave_one_startup_out(df, trainer, target_col)
    metrics = safe_classification_metrics(oof[target_col].to_numpy(), oof["oof"].to_numpy())
    interval = bootstrap_interval(oof, target_col, "oof", seed=seed)
    return {"pooledOutOfFold": metrics, "uncertainty": interval, "perFold": {"status": NOT_EVALUABLE, "reason": "each held-out startup contributes one or two rows of a single class", "folds": int(df["startupId"].nunique())}}


def calibration_status(n_rows: int, n_pos: int) -> str:
    return "AVAILABLE" if n_rows >= MIN_ROWS_FOR_CALIBRATION and n_pos >= MIN_POSITIVES_FOR_CALIBRATION else CALIBRATION_NOTE


def run_experiment(df: pd.DataFrame, manifest: dict, algorithms: list[str], *, seed: int) -> dict:
    """Evaluates (LOSO) and fits final models. Returns everything needed to report/register; registers nothing itself."""
    target_col = f"target_{manifest['target']}"
    cond = check_experimental_condition(df, target_col)
    feature_cols = select_feature_cols(df)
    trainers = make_trainers(feature_cols, target_col, seed)
    df = df.sort_values(["startupId", "snapshotAt"]).reset_index(drop=True)
    results: dict = {}
    fitted: dict[str, TrainedModel] = {}
    for name in ["majority", *algorithms]:
        if name not in trainers:
            raise ValueError(f"Unknown algorithm '{name}'")
        results[name] = evaluate_algorithm(df, trainers[name], target_col, seed=seed)
        if name != "majority":
            fitted[name] = trainers[name](df)
    importance: dict = {}
    for name, model in fitted.items():
        if model.algorithm in ("catboost", "xgboost"):
            ex = explain_tree_model(model, df)
            importance[name] = {"label": "EXPLORATORY — unstable at this sample size, not causal", "available": ex.available, "top": ex.global_importance[:8], "reason": ex.reason}
    return {
        "condition": cond, "featureCols": feature_cols, "results": results, "importance": importance,
        "calibration": calibration_status(len(df), cond["positive"]), "fitted": fitted,
        "winner": "NO RELIABLE WINNER AT CURRENT SAMPLE SIZE",
    }


def _jsonable(o):
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items() if k != "fitted"}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    return o


def experimental_metrics_payload(name: str, run: dict, manifest: dict) -> dict:
    """What gets stored on the registry row and training run — carries the labels that stop anyone mistaking this for a production model."""
    return {
        "experimental": True, "production": False, "publicScoreInfluence": False, "mlWeight": 0,
        "datasetVersion": manifest["datasetVersion"], "datasetSha256": manifest["csvSha256"], "gitCommit": manifest["gitCommit"],
        "readinessVersion": manifest["readinessVersion"], "targetVersion": manifest["targetVersion"],
        "trainingRows": manifest["rowCount"], "positiveCount": manifest["positiveCount"], "negativeCount": manifest["negativeCount"],
        "evaluation": "Leave-one-startup-out grouped cross-validation, pooled out-of-fold predictions. Experimental evaluation on "
                      f"{manifest['rowCount']} eligible historical examples. Metrics are highly uncertain due to small sample size.",
        "pooledOutOfFold": run["results"][name]["pooledOutOfFold"], "uncertainty": run["results"][name]["uncertainty"], "perFold": run["results"][name]["perFold"],
        "majorityClassReference": run["results"]["majority"]["pooledOutOfFold"],
        "calibration": run["calibration"], "featureImportance": run["importance"].get(name), "limitations": LIMITATIONS,
        "productionGate": manifest["productionReadiness"],
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="EXPERIMENTAL model training on a frozen dataset (never production)")
    p.add_argument("--dataset", required=True, help="Directory of a frozen dataset version")
    p.add_argument("--algorithms", default="logistic,catboost,xgboost")
    p.add_argument("--no-register", action="store_true", help="Evaluate and report only; do not register models or record a run")
    p.add_argument("--report", default=None, help="Write the full JSON report here")
    p.add_argument("--created-by", default="experimental-cli")
    args = p.parse_args(argv)

    settings = get_settings()
    try:
        df, manifest = load_frozen_dataset(Path(args.dataset))
        run = run_experiment(df, manifest, [a.strip() for a in args.algorithms.split(",") if a.strip()], seed=settings.random_seed)
    except (FrozenDatasetError, ExperimentalTrainingBlocked) as e:
        print(str(e))
        return 1

    target = manifest["target"]
    print(f"{manifest['datasetVersion']}: {manifest['rowCount']} rows ({manifest['positiveCount']} positive / {manifest['negativeCount']} negative), {run['condition']['startups']} startups, {len(run['featureCols'])} features with data")
    for name, r in run["results"].items():
        m = r["pooledOutOfFold"]
        print(f"  {name:9} ROC-AUC={m['rocAuc'] if isinstance(m['rocAuc'], str) else round(m['rocAuc'], 3)}  PR-AUC={m['prAuc'] if isinstance(m['prAuc'], str) else round(m['prAuc'], 3)}  Brier={round(m['brierScore'], 3)}  uncertainty={r['uncertainty'].get('status')}")
    print(f"  calibration: {run['calibration']}\n  winner: {run['winner']}")

    registered: list[str] = []
    started = datetime.now(timezone.utc)
    if not args.no_register:
        client = RuwadClient(settings)
        store = ArtifactStore(settings.artifact_dir)
        for name, model in run["fitted"].items():
            version = build_model_version(target, manifest["windowMonths"], model.algorithm.replace("baseline-", ""), is_experimental=True)
            payload = experimental_metrics_payload(name, run, manifest)
            metadata = ModelMetadata(
                model_version=version, target_name=target, target_version=manifest["targetVersion"], feature_schema_version=ML_FEATURE_SCHEMA_VERSION,
                algorithm=model.algorithm, prediction_type="PROBABILITY", hyperparameters={k: v for k, v in model.hyperparameters.items() if isinstance(v, (int, float, str, bool, type(None)))},
                feature_cols=model.feature_cols, categorical_cols=getattr(model.preprocessor, "categorical_cols", []),
                training_rows=int(manifest["rowCount"]), validation_rows=0, test_rows=0, metrics=payload, is_test_only=False, is_experimental=True,
                trained_at=datetime.now(timezone.utc).isoformat(),
            )
            register_trained_model(store, client, estimator=model.estimator, preprocessor=model.preprocessor, metadata=metadata,
                                   training_period_start=str(df["snapshotAt"].min()), training_period_end=str(df["snapshotAt"].max()))
            registered.append(version)
        client.record_training_run({
            "targetName": target, "targetVersion": manifest["targetVersion"], "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION,
            "algorithm": ",".join(run["fitted"].keys()), "status": "COMPLETED", "startedAt": started.isoformat(), "completedAt": datetime.now(timezone.utc).isoformat(),
            "datasetRows": int(manifest["rowCount"]),
            "metrics": {"experimental": True, "production": False, "datasetVersion": manifest["datasetVersion"], "gitCommit": manifest["gitCommit"], "registeredModels": registered,
                        "note": "Experimental run on real eligible data below the production readiness gate; not production training."},
            "modelVersion": registered[0] if registered else None, "artifactLocation": registered[0] if registered else None, "createdBy": args.created_by, "isTestOnly": False,
        })
        print(f"Registered EXPERIMENTAL models: {registered}")

    if args.report:
        Path(args.report).write_text(json.dumps(_jsonable({"manifest": {k: manifest[k] for k in ("datasetVersion", "rowCount", "positiveCount", "negativeCount", "gitCommit", "csvSha256")}, "run": run, "registered": registered, "limitations": LIMITATIONS}), indent=2, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
