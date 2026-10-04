"""Artifact integrity: a model is served in production only if its files are byte-for-byte what the committed manifest says.

`model_manifest.json` (tracked in git, next to the packaged artifact) lists, per model version, the SHA-256 of every file plus the identity the
service must see: model version, target, target version, feature schema version, algorithm, experimental flag. Verification runs BEFORE any
joblib file is unpickled (a pickle is code), and again never for a version that already passed.

    load manifest -> hash every file -> compare identity fields -> (only then) unpickle

Any mismatch makes the model unavailable: loader.get() returns None (a controlled 404 for callers) and /health reports not-ready.
The service never answers with a model it could not verify.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

ARTIFACT_FILES = ("estimator.joblib", "preprocessor.joblib", "metadata.json", "training_profile.json")
IDENTITY_FIELDS = ("modelVersion", "targetName", "targetVersion", "featureSchemaVersion", "algorithm")


@dataclass
class VerificationResult:
    model_version: str
    ok: bool
    problems: list[str] = field(default_factory=list)


def sha256_file(path: Path) -> str:
    """SHA-256 of the file. Text files (.json) are hashed with CRLF folded to LF, so the same artifact verifies on Windows (git autocrlf)
    and on Linux; binary files (.joblib) are hashed byte for byte."""
    h = hashlib.sha256()
    if path.suffix == ".json":
        h.update(path.read_bytes().replace(b"\r\n", b"\n"))
        return h.hexdigest()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest(path: str | Path) -> dict | None:
    p = Path(path)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and isinstance(data.get("models"), dict) else None


def verify_model(artifact_dir: str | Path, manifest: dict | None, model_version: str) -> VerificationResult:
    """Never raises: every failure becomes a problem string (no paths or file contents)."""
    problems: list[str] = []
    if manifest is None:
        return VerificationResult(model_version, False, ["manifest missing or unreadable"])
    entry = manifest["models"].get(model_version)
    if not isinstance(entry, dict) or not isinstance(entry.get("files"), dict):
        return VerificationResult(model_version, False, ["model version is not in the manifest"])

    model_dir = Path(artifact_dir) / model_version
    if not model_dir.is_dir():
        return VerificationResult(model_version, False, ["artifact directory not found"])

    expected_files: dict[str, str] = entry["files"]
    present = {p.name for p in model_dir.iterdir() if p.is_file()}
    extra = sorted(present - set(expected_files))
    if extra:
        problems.append(f"unexpected files present: {', '.join(extra)}")
    for name, expected in expected_files.items():
        path = model_dir / name
        if not path.is_file():
            problems.append(f"{name}: missing")
            continue
        actual = sha256_file(path)
        if actual != expected:
            problems.append(f"{name}: SHA-256 mismatch")

    metadata_path = model_dir / "metadata.json"
    if metadata_path.is_file() and not any(p.startswith("metadata.json") for p in problems):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except ValueError:
            metadata = {}
            problems.append("metadata.json: unreadable")
        for key in IDENTITY_FIELDS:
            want = entry.get(key) if key != "modelVersion" else model_version
            if want is not None and metadata.get(key) != want:
                problems.append(f"{key} does not match the manifest")
        if bool(entry.get("isExperimental")) != bool(metadata.get("isExperimental")):
            problems.append("experimental flag does not match the manifest")
        want_dataset = entry.get("datasetSha256")
        if want_dataset and (metadata.get("metrics") or {}).get("datasetSha256") != want_dataset:
            problems.append("dataset fingerprint does not match the manifest")
    return VerificationResult(model_version, not problems, problems)
