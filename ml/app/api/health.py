from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..inference.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request):
    """Liveness AND readiness of the configured model. Unauthenticated (it is the platform health check), so it states only whether the
    model is usable; it never returns paths, secrets or artifact contents.

    With REQUIRE_VERIFIED_ARTIFACTS=true the answer is 503 / "degraded" unless the configured model's files match the manifest and the
    model has loaded, so traffic is never routed to a service that cannot predict safely."""
    settings = request.app.state.settings
    loader = request.app.state.loader
    version = (settings.ml_experimental_model_version or "").strip()
    body = HealthResponse(status="ok", modelsAvailable=len(loader.list_available()))
    if version:
        loaded = loader.get(version)
        check = loader.verify(version)
        body.modelVersion = version
        body.modelLoaded = loaded is not None
        body.artifactVerified = None if check is None else check.ok
        if loaded is not None:
            body.statusType = "EXPERIMENTAL" if loaded.metadata.is_experimental else None
            body.featureSchemaVersion = loaded.metadata.feature_schema_version
            body.targetVersion = loaded.metadata.target_version
    if settings.require_verified_artifacts:
        ready = bool(version) and bool(body.modelLoaded) and body.artifactVerified is True and body.statusType == "EXPERIMENTAL"
        if not ready:
            body.status = "degraded"
            return JSONResponse(status_code=503, content=body.model_dump())
    return body
