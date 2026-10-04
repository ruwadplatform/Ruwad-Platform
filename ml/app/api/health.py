from __future__ import annotations

from fastapi import APIRouter, Request

from ..inference.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    loader = request.app.state.loader
    return HealthResponse(status="ok", modelsAvailable=len(loader.list_available()))
