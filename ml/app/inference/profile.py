"""Training-distribution profile for an experimental model: per-feature observed count and min/max over the FROZEN dataset the model was
trained on, plus row counts. No row-level data. Written as a sidecar next to the artifact (the estimator, preprocessor and metadata files
are never rewritten) and used by the live endpoint to flag inputs outside what the model saw.

    python -m app.inference.profile --dataset datasets/RUWAD-REAL-DATASET-v1 --model-version <exp-...>
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

from ..config import get_settings
from ..registry.artifact_store import ArtifactStore
from ..training.frozen_dataset import load_frozen_dataset


def build_profile(df, manifest: dict, feature_cols: list[str]) -> dict:
    features = {}
    for col in feature_cols:
        s = df[col].dropna() if col in df.columns else df.iloc[0:0, 0]
        features[col] = {"count": int(len(s)), "min": float(s.min()) if len(s) else None, "max": float(s.max()) if len(s) else None}
    populated = df[[c for c in feature_cols if c in df.columns]].notna().sum(axis=1)
    return {
        "datasetVersion": manifest["datasetVersion"], "datasetSha256": manifest["csvSha256"], "rows": int(len(df)),
        "positives": int(manifest["positiveCount"]), "negatives": int(manifest["negativeCount"]), "features": features,
        "populatedPerRowHistogram": {str(int(k)): int(v) for k, v in populated.value_counts().sort_index().items()},
        "createdAt": datetime.now(timezone.utc).isoformat(), "note": "Aggregate statistics only; no rows.",
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Write the training-distribution sidecar for an experimental model")
    p.add_argument("--dataset", required=True)
    p.add_argument("--model-version", required=True)
    args = p.parse_args(argv)
    settings = get_settings()
    store = ArtifactStore(settings.artifact_dir)
    _, _, metadata = store.load(args.model_version)
    if not metadata.is_experimental:
        print("Refusing: this model is not flagged experimental.")
        return 1
    df, manifest = load_frozen_dataset(Path(args.dataset))
    profile = build_profile(df, manifest, metadata.feature_cols)
    path = store.write_profile(args.model_version, profile)
    print(f"Wrote {path} (rows={profile['rows']}, sha256={hashlib.sha256(path.read_bytes()).hexdigest()[:12]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
