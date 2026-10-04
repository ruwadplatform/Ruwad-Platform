"""Package ONE trained experimental model for deployment and (re)write its manifest entry.

    python -m app.inference.package_artifact --model-version exp-...-catboost-... [--source artifacts] [--dest model_artifacts]

What is copied (nothing else ever leaves the artifact directory):
  estimator.joblib, preprocessor.joblib, metadata.json   exactly as trained (byte-identical, hashed)
  training_profile.json                                  per-feature counts and COARSE bounds (see below), regenerated for packaging

The packaged profile is deliberately coarser than the local one: with 3-12 populated values per feature, an exact min/max would be an
individual company's value. Each lower bound is halved and each upper bound doubled, then rounded outward to one significant figure.
It only feeds a "this value is outside what the model has seen" warning, so a wider band is the safe direction.

No dataset row, name, identifier, PitchBook export or source document is read or copied. The packager refuses a model that is not flagged
experimental, and refuses to overwrite an existing manifest entry whose files differ (an artifact is write-once).
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path

from ..config import ML_DIR
from .integrity import sha256_file


def _floor_1sig(x: float) -> float:
    if x <= 0:
        return 0.0
    e = math.floor(math.log10(x))
    return math.floor(x / 10**e) * 10**e


def _ceil_1sig(x: float) -> float:
    if x <= 0:
        return 0.0
    e = math.floor(math.log10(x))
    return math.ceil(x / 10**e) * 10**e


def coarse_profile(profile: dict) -> dict:
    out = {k: v for k, v in profile.items() if k not in ("features", "createdAt")}
    out["features"] = {}
    for name, f in profile.get("features", {}).items():
        lo, hi = f.get("min"), f.get("max")
        out["features"][name] = {
            "count": f.get("count", 0),
            "min": None if lo is None else _floor_1sig(lo / 2),
            "max": None if hi is None else _ceil_1sig(hi * 2),
        }
    out["note"] = "Aggregate statistics only; no rows. Bounds are coarse (lower halved, upper doubled, rounded outward to 1 significant figure)."
    return out


def package(source: Path, dest: Path, model_version: str, manifest_path: Path) -> dict:
    src = source / model_version
    meta = json.loads((src / "metadata.json").read_text(encoding="utf-8"))
    if not meta.get("isExperimental"):
        raise SystemExit("Refusing: this model is not flagged experimental.")
    out_dir = dest / model_version
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in ("estimator.joblib", "preprocessor.joblib", "metadata.json"):
        shutil.copyfile(src / name, out_dir / name)
    profile = json.loads((src / "training_profile.json").read_text(encoding="utf-8"))
    (out_dir / "training_profile.json").write_text(json.dumps(coarse_profile(profile), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    files = {name: sha256_file(out_dir / name) for name in ("estimator.joblib", "preprocessor.joblib", "metadata.json", "training_profile.json")}
    entry = {
        "targetName": meta["targetName"], "targetVersion": meta["targetVersion"], "featureSchemaVersion": meta["featureSchemaVersion"], "algorithm": meta["algorithm"],
        "isExperimental": True, "status": "EXPERIMENTAL", "datasetVersion": (meta.get("metrics") or {}).get("datasetVersion"),
        "datasetSha256": (meta.get("metrics") or {}).get("datasetSha256"), "trainingRows": meta.get("trainingRows"), "files": files,
        "selection": "Manual experimental configuration; no statistical winner.",
    }
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"manifestVersion": 1, "models": {}}
    existing = manifest["models"].get(model_version)
    if existing and existing.get("files") != files:
        raise SystemExit("Refusing: the manifest already pins different file hashes for this version (artifacts are write-once).")
    manifest["models"][model_version] = entry
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return entry


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Package one experimental model artifact and pin it in the manifest")
    p.add_argument("--model-version", required=True)
    p.add_argument("--source", default=str(ML_DIR / "artifacts"))
    p.add_argument("--dest", default=str(ML_DIR / "model_artifacts"))
    p.add_argument("--manifest", default=str(ML_DIR / "model_manifest.json"))
    a = p.parse_args(argv)
    entry = package(Path(a.source), Path(a.dest), a.model_version, Path(a.manifest))
    print(json.dumps({"modelVersion": a.model_version, "files": entry["files"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
