"""Pydantic request/response models for the FastAPI service — the model
input/output CONTRACT. Note what's intentionally absent from
PredictRequest: no founder name, email, phone, documents, pitch-deck text,
NDA data or Data Room data can even be expressed here — `features` is a
plain `dict[str, float | int | bool | str | None]`, and the predictor only
ever reads keys that are in ML_FEATURES_V1 (app/ml_features.py), silently
ignoring anything else a caller sent. The allowlist is enforced on BOTH
sides: NestJS never sends more than the allowlist to begin with (see
MlDatasetExportService), and this service never reads past it either.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

FeatureValue = float | int | bool | str | None


class PredictRequest(BaseModel):
    startupId: str
    snapshotAt: str
    featureSchemaVersion: str
    features: dict[str, FeatureValue] = Field(default_factory=dict)
    modelVersion: str


class PredictResponse(BaseModel):
    target: str
    targetVersion: str
    modelVersion: str
    prediction: float
    predictionType: Literal["PROBABILITY", "REGRESSION_VALUE"]
    modelStatus: str
    featureSchemaVersion: str


class BatchPredictRequest(BaseModel):
    startupId: str
    snapshotAt: str
    featureSchemaVersion: str
    features: dict[str, FeatureValue] = Field(default_factory=dict)
    modelVersions: list[str]


class BatchPredictResponse(BaseModel):
    predictions: list[PredictResponse]
    errors: list[dict[str, str]] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    modelsAvailable: int


class ModelSummary(BaseModel):
    modelVersion: str
    targetName: str
    algorithm: str
    featureSchemaVersion: str
    isTestOnly: bool
    trainedAt: str


class ModelsResponse(BaseModel):
    models: list[ModelSummary]
