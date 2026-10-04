"""FastAPI inference service entrypoint.

    uvicorn app.main:app --port 8001

Training is deliberately NOT exposed here — it's CLI-only
(`python -m app.training.train`), never a public/unauthenticated HTTP
endpoint (see docs/ml-training-methodology.md). This app only ever reads
already-trained artifacts from disk and serves predictions.
"""
from __future__ import annotations

from fastapi import FastAPI

from .api import health, models, predict
from .config import get_settings
from .inference.loader import ModelLoader
from .registry.artifact_store import ArtifactStore

settings = get_settings()
store = ArtifactStore(settings.artifact_dir)
loader = ModelLoader(store)

app = FastAPI(title="RUWĀD ML Inference Service", version="1.0.0")
app.state.settings = settings
app.state.loader = loader

app.include_router(health.router)
app.include_router(predict.router)
app.include_router(models.router)
