"""Local introspection only — NOT the source of truth for model status
(that's NestJS's `ml_models` table). Useful for debugging/ops: "what does
this service actually have on disk right now."
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..inference.schemas import ModelsResponse, ModelSummary
from .auth import verify_service_token

# Introspection is for the trusted backend / operators only, never anonymous.
router = APIRouter(dependencies=[Depends(verify_service_token)])


@router.get("/models", response_model=ModelsResponse)
def list_models(request: Request) -> ModelsResponse:
    loader = request.app.state.loader
    summaries = [
        ModelSummary(modelVersion=m.model_version, targetName=m.target_name, algorithm=m.algorithm, featureSchemaVersion=m.feature_schema_version, isTestOnly=m.is_test_only, trainedAt=m.trained_at)
        for m in loader.list_available()
    ]
    return ModelsResponse(models=summaries)
