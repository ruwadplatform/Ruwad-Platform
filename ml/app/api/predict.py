from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from ..inference.experimental import NotExperimentalError, predict_experimental
from ..inference.predictor import ExperimentalModelNotServedError, ModelNotFoundError, SchemaMismatchError, predict_one
from ..inference.schemas import BatchPredictRequest, BatchPredictResponse, ExperimentalPredictRequest, ExperimentalPredictResponse, PredictRequest, PredictResponse
from .auth import verify_service_token

logger = logging.getLogger("ruwad.ml.predict")
router = APIRouter(dependencies=[Depends(verify_service_token)])


@router.post("/predict", response_model=PredictResponse)
def predict(request: Request, body: PredictRequest) -> PredictResponse:
    loader = request.app.state.loader
    try:
        return predict_one(loader, body)
    except ModelNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except (SchemaMismatchError, ExperimentalModelNotServedError) as e:
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
        except (SchemaMismatchError, ExperimentalModelNotServedError) as e:
            errors.append({"modelVersion": model_version, "error": str(e)})
    return BatchPredictResponse(predictions=predictions, errors=errors)


@router.post("/predict/experimental", response_model=ExperimentalPredictResponse)
def predict_experimental_route(request: Request, body: ExperimentalPredictRequest) -> ExperimentalPredictResponse:
    """Experimental, admin-internal estimate from ONE explicitly named model. Only serves a model whose artifact is flagged
    experimental; applies the minimum-data and training-range checks; never returns a fallback value."""
    loader = request.app.state.loader
    try:
        r = predict_experimental(loader, model_version=body.modelVersion, feature_schema_version=body.featureSchemaVersion, features=body.features)
    except ModelNotFoundError as e:
        logger.warning("experimental predict: model unavailable (not found, not allowed, or failed verification)")
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SchemaMismatchError as e:
        logger.warning("experimental predict: feature schema mismatch")
        raise HTTPException(status_code=409, detail=str(e)) from e
    except NotExperimentalError as e:
        logger.warning("experimental predict: refused a model that is not flagged experimental")
        raise HTTPException(status_code=409, detail=str(e)) from e
    # Counts and labels only: never feature values, identifiers or the startup id.
    logger.info("experimental predict: status=%s populated=%d completeness=%s reliability=%s", r.status, len(r.populated_features), r.feature_completeness, r.reliability)
    return ExperimentalPredictResponse(
        status=r.status, modelVersion=r.model_version, target=r.target, targetVersion=r.target_version, featureSchemaVersion=r.feature_schema_version,
        prediction=r.prediction, reliability=r.reliability, reliabilityReasons=r.reliability_reasons, featureCompleteness=r.feature_completeness,
        populatedFeatures=r.populated_features, missingFeatures=r.missing_features, outOfRange=r.out_of_range, invalidFeatures=r.invalid_features, reasons=r.reasons,
        trainingRows=r.training_rows, trainingPositives=r.training_positives, trainingNegatives=r.training_negatives, algorithm=r.algorithm, datasetVersion=r.dataset_version,
        drivers=r.drivers, driversNote=r.drivers_note, warnings=r.warnings,
    )
