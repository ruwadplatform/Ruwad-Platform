"""FastAPI inference service entrypoint.

    uvicorn app.main:app --port 8001

Training is deliberately NOT exposed here — it's CLI-only
(`python -m app.training.train`), never a public/unauthenticated HTTP
endpoint (see docs/ml-training-methodology.md). This app only ever reads
already-trained artifacts from disk and serves predictions.
"""
from __future__ import annotations

import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import health, models, predict
from .config import get_settings
from .inference.experimental import warm_up
from .inference.integrity import load_manifest, verify_model
from .inference.loader import ModelLoader
from .registry.artifact_store import ArtifactStore

settings = get_settings()
store = ArtifactStore(settings.artifact_dir)


def build_loader(cfg=settings, artifact_store=store) -> ModelLoader:
    """Production mode serves exactly one explicitly configured model and verifies it against the committed manifest before unpickling it."""
    if not cfg.require_verified_artifacts:
        return ModelLoader(artifact_store)
    manifest = load_manifest(cfg.model_manifest_path)
    version = (cfg.ml_experimental_model_version or "").strip()
    return ModelLoader(artifact_store, verifier=lambda v: verify_model(cfg.artifact_dir, manifest, v), allowed_versions={version} if version else set())


loader = build_loader()



@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm the model cache and the SHAP import in the background; /health is available immediately.
    threading.Thread(target=warm_up, args=(loader,), daemon=True).start()
    yield


# Interactive docs and the OpenAPI document are an unnecessary public surface in production.
_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.require_verified_artifacts else {}
app = FastAPI(title="RUWĀD ML Inference Service", version="1.0.0", lifespan=lifespan, **_docs)
app.state.settings = settings
app.state.loader = loader

app.include_router(health.router)
app.include_router(predict.router)
app.include_router(models.router)
