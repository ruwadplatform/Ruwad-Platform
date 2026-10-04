"""Single source of truth for every environment-driven setting — mirrors the
backend's own "never inline env var reads" convention (see
backend/src/scoring/scoring.constants.ts and friends).
"""
from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ML_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ML_DIR / ".env"), env_file_encoding="utf-8", extra="ignore")

    # --- RUWĀD backend connection (training-data fetch + run/model reporting) ---
    ruwad_api_base_url: str = "http://localhost:4000/api"
    ruwad_admin_email: str = ""
    ruwad_admin_password: str = ""

    # --- Inbound auth for /predict* (NestJS -> this service) ---
    # Must match the backend's ML_SERVICE_TOKEN exactly. An empty value
    # means /predict* always rejects — this service never silently accepts
    # unauthenticated prediction requests.
    ml_service_token: str = ""

    # --- Artifact storage ---
    artifact_dir: str = str(ML_DIR / "artifacts")

    # --- FastAPI server ---
    port: int = 8001
    host: str = "127.0.0.1"

    # --- Reproducibility ---
    random_seed: int = 42

    @field_validator("artifact_dir", mode="before")
    @classmethod
    def _default_artifact_dir_when_blank(cls, v: str) -> str:
        # An empty ARTIFACT_DIR= line in .env is a present-but-blank value,
        # which pydantic-settings would otherwise treat as "artifact_dir is
        # the empty string" rather than falling back to the field default —
        # silently resolving to the current working directory instead of
        # ml/artifacts/. Caught by manual verification: a training run left
        # a model directory directly under ml/ instead of ml/artifacts/.
        return str(ML_DIR / "artifacts") if not v else v


def get_settings() -> Settings:
    return Settings()
