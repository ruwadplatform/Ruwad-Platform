"""Frozen, auditable dataset versions.

A dataset version is a directory containing the exported rows (`dataset.csv`)
and a `manifest.json` that records exactly what is in it, how it was selected
and which code produced it. Versions are WRITE-ONCE: an existing version is
never overwritten, so "Experimental model v1" can always be traced to the very
rows it saw, and v2 is compared against v1 rather than replacing it.

Only training-ELIGIBLE rows are ever frozen (the backend's default export
already excludes analysis-only/excluded snapshots, unlabelled and
coverage-unattested rows; this module re-checks it). Identifiers are internal
UUIDs only — the export never carries names, emails, scores or Data Room
contents.

    python -m app.training.frozen_dataset --target raisedNewRoundWithin6Months \
        --version RUWAD-REAL-DATASET-v1 --git-commit <hash> [--extra-json provenance.json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ..ml_features import ML_FEATURES_V1
from ..ruwad_client import RuwadClient

DATASET_FILE = "dataset.csv"
MANIFEST_FILE = "manifest.json"
CORE_FEATURES = ["annualRevenue", "customerCount", "fundingRounds", "founderExperienceYears", "teamSize", "regulatoryMilestone"]

ELIGIBILITY_RULES = (
    "Only snapshots whose trainingEligibility is ELIGIBLE: selection method FIXED_CALENDAR_GRID (or another pre-declared, outcome-blind method). "
    "LEGACY_OUTCOME_AWARE and undeclared snapshots are ANALYSIS_ONLY and excluded; EXCLUDED snapshots are excluded."
)
SELECTION_RULES = (
    "Snapshot dates are fixed June 30 / December 31 grid dates, at least 12 months apart per company, at most 3 per company, never chosen because of a nearby outcome. "
    "A negative label requires a matured window AND attested FUNDING coverage through the window end; otherwise the row is unknown and excluded."
)


# Columns the export carries for context that must NOT enter a frozen training dataset.
DROPPED_COLUMNS = {
    "startupStage": "Historical snapshots store the startup's CURRENT stage at build time, not its stage as of snapshotAt, so it would leak later funding into the label.",
}


class FrozenDatasetError(RuntimeError):
    pass


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(df: pd.DataFrame, *, dataset_version: str, target_name: str, target_meta, readiness: dict, dashboard: dict | None, git_commit: str, csv_sha256: str, extra: dict | None) -> dict:
    target_col = f"target_{target_name}"
    core_present = {k: int(df[k].notna().sum()) if k in df.columns else 0 for k in CORE_FEATURES}
    cells = len(df) * len(CORE_FEATURES)
    features_present = {k: int(df[k].notna().sum()) for k in ML_FEATURES_V1 if k in df.columns and df[k].notna().any()}
    positives = int(df[target_col].astype(bool).sum())
    return {
        "datasetVersion": dataset_version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "readinessVersion": int(readiness.get("readinessVersion", 0)),
        "target": target_name,
        "targetVersion": getattr(target_meta, "target_version", None),
        "windowMonths": getattr(target_meta, "window_months", None),
        "featureSchemaVersion": str(df["featureSchemaVersion"].iloc[0]) if "featureSchemaVersion" in df.columns and len(df) else None,
        "trainingEligibilityRules": ELIGIBILITY_RULES,
        "snapshotSelectionRules": SELECTION_RULES,
        "rowCount": int(len(df)),
        "startupCount": int(df["startupId"].nunique()) if "startupId" in df.columns else None,
        "positiveCount": positives,
        "negativeCount": int(len(df) - positives),
        "excludedAtFreezeTime": {
            "unknownCoverageUnattested": readiness.get("unknownExamples"),
            "analysisOnlySnapshots": readiness.get("analysisOnlySnapshots"),
            "excludedSnapshots": readiness.get("excludedSnapshots"),
            "notMatured": readiness.get("notMatured"),
            "insufficientData": readiness.get("insufficientData"),
            "totalSnapshotsInDatabase": readiness.get("totalSnapshots"),
        },
        "snapshotAtRange": [str(df["snapshotAt"].min()), str(df["snapshotAt"].max())] if "snapshotAt" in df.columns and len(df) else None,
        "selectionMethods": df["snapshotSelectionMethod"].value_counts().to_dict() if "snapshotSelectionMethod" in df.columns else None,
        "coreFeatureCoverage": {
            "presentCellsOverRows": round(sum(core_present.values()) / cells, 4) if cells else 0.0,
            "perFeatureNonNullRows": core_present,
            "readinessV2ApplicabilityAware": readiness.get("featureCoverage"),
            "note": "No NOT_APPLICABLE declarations exist, so applicability-aware coverage equals plain coverage.",
        },
        "featureNonNullRows": features_present,
        "provenanceSummary": {
            "evidence": (dashboard or {}).get("evidence"),
            "outcomeCoverageByFamily": (dashboard or {}).get("outcomeCoverage"),
            "caveats": (dashboard or {}).get("caveats"),
        },
        "gitCommit": git_commit,
        "productionReadiness": {"ready": bool(readiness.get("ready")), "reasons": readiness.get("reasons"), "thresholds": readiness.get("thresholds")},
        "readinessReport": readiness,
        "droppedColumns": DROPPED_COLUMNS,
        "columns": list(df.columns),
        "csvSha256": csv_sha256,
        "privacy": "Internal UUIDs and allow-listed numeric/categorical features only. No names, emails, phones, RUWAD scores, factor scores, notes or Data Room contents.",
        "extra": extra or {},
    }


def freeze_dataset(client: RuwadClient, target_meta, *, dataset_version: str, out_root: Path, git_commit: str, extra: dict | None = None) -> Path:
    out_dir = out_root / dataset_version
    if out_dir.exists():
        raise FrozenDatasetError(f"{out_dir} already exists: a dataset version is write-once and is never overwritten. Pick a new version name.")
    readiness = client.fetch_readiness(target_meta.name)
    if int(readiness.get("readinessVersion", 0)) != 2:
        raise FrozenDatasetError("The backend did not return a Readiness V2 report; refusing to freeze a dataset from it.")

    rows = client.fetch_export(target_meta.name, include_identifiers=True)  # default export: ELIGIBLE + AVAILABLE rows only
    df = pd.DataFrame(rows)
    target_col = f"target_{target_meta.name}"
    if df.empty or target_col not in df.columns:
        raise FrozenDatasetError("The export is empty or lacks the target column.")
    if "trainingEligibility" not in df.columns or not (df["trainingEligibility"] == "ELIGIBLE").all():
        raise FrozenDatasetError("The export contains rows that are not training-ELIGIBLE (or does not say); refusing to freeze.")
    if not (df[f"{target_col}_status"] == "AVAILABLE").all():
        raise FrozenDatasetError("The export contains rows without an AVAILABLE label; refusing to freeze.")
    if int(readiness["usableExamples"]) != len(df):
        raise FrozenDatasetError(f"Export rows ({len(df)}) do not match Readiness V2 usable examples ({readiness['usableExamples']}).")
    df[target_col] = df[target_col].astype(bool).astype(int)
    df = df.drop(columns=[c for c in DROPPED_COLUMNS if c in df.columns])
    df = df.sort_values(["startupId", "snapshotAt"]).reset_index(drop=True)

    out_dir.mkdir(parents=True, exist_ok=False)
    csv_path = out_dir / DATASET_FILE
    df.to_csv(csv_path, index=False)
    try:
        dashboard = client.fetch_readiness_dashboard()
    except Exception:  # noqa: BLE001 — the provenance summary is enrichment, not a freeze precondition
        dashboard = None
    manifest = build_manifest(df, dataset_version=dataset_version, target_name=target_meta.name, target_meta=target_meta, readiness=readiness, dashboard=dashboard, git_commit=git_commit, csv_sha256=sha256_of(csv_path), extra=extra)
    (out_dir / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    return out_dir


def load_frozen_dataset(dataset_dir: Path) -> tuple[pd.DataFrame, dict]:
    """Loads a frozen version and re-verifies it: hash, eligibility, labels."""
    manifest_path, csv_path = dataset_dir / MANIFEST_FILE, dataset_dir / DATASET_FILE
    if not manifest_path.exists() or not csv_path.exists():
        raise FrozenDatasetError(f"{dataset_dir} is not a frozen dataset (needs {MANIFEST_FILE} and {DATASET_FILE}).")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if sha256_of(csv_path) != manifest["csvSha256"]:
        raise FrozenDatasetError("dataset.csv does not match the hash recorded when it was frozen; the dataset was modified.")
    df = pd.read_csv(csv_path)
    target_col = f"target_{manifest['target']}"
    if "trainingEligibility" not in df.columns or not (df["trainingEligibility"] == "ELIGIBLE").all():
        raise FrozenDatasetError("The frozen dataset contains rows that are not training-ELIGIBLE.")
    if target_col not in df.columns or len(df) != manifest["rowCount"]:
        raise FrozenDatasetError("The frozen dataset's shape does not match its manifest.")
    return df, manifest


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Freeze a real, training-eligible dataset version")
    p.add_argument("--target", required=True)
    p.add_argument("--version", required=True, help="e.g. RUWAD-REAL-DATASET-v1")
    p.add_argument("--git-commit", required=True)
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "datasets"))
    p.add_argument("--extra-json", default=None, help="Optional JSON file merged into the manifest under 'extra' (e.g. per-feature provenance counts)")
    args = p.parse_args(argv)

    from ..config import get_settings
    from .target_types import fetch_target_meta

    client = RuwadClient(get_settings())
    meta = fetch_target_meta(client, args.target)
    extra = json.loads(Path(args.extra_json).read_text(encoding="utf-8")) if args.extra_json else None
    out = freeze_dataset(client, meta, dataset_version=args.version, out_root=Path(args.out), git_commit=args.git_commit, extra=extra)
    m = json.loads((out / MANIFEST_FILE).read_text(encoding="utf-8"))
    print(f"Frozen {m['datasetVersion']} at {out}: rows={m['rowCount']} positive={m['positiveCount']} negative={m['negativeCount']} sha256={m['csvSha256'][:12]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
