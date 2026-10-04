from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..inference.predictor import ModelNotFoundError, SchemaMismatchError, predict_one
from ..inference.schemas import BatchPredictRequest, BatchPredictResponse, PredictRequest, PredictResponse
from .auth import verify_service_token

router = APIRouter(dependencies=[Depends(verify_service_token)])


@router.post("/predict", response_model=PredictResponse)
def predict(request: Request, body: PredictRequest) -> PredictResponse:
    loader = request.app.state.loader
    try:
        return predict_one(loader, body)
    except ModelNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SchemaMismatchError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch(request: Request, body: BatchPredictRequest) -> BatchPredictResponse:
    """One feature vector against several model versions — the real
    shadow-prediction use case (see backend's MlShadowPredictionService).
    A single model failing (not found, schema mismatch) is recorded in
    `errors` and does NOT stop the other models in the same batch from
    being evaluated."""
    loader = request.app.state.loader
    predictions: list[PredictResponse] = []
    errors: list[dict[str, str]] = []
    for model_version in body.modelVersions:
        single = PredictRequest(startupId=body.startupId, snapshotAt=body.snapshotAt, featureSchemaVersion=body.featureSchemaVersion, features=body.features, modelVersion=model_version)
        try:
            predictions.append(predict_one(loader, single))
        except ModelNotFoundError as e:
            errors.append({"modelVersion": model_version, "error": str(e)})
        except SchemaMismatchError as e:
            errors.append({"modelVersion": model_version, "error": str(e)})
    return BatchPredictResponse(predictions=predictions, errors=errors)
