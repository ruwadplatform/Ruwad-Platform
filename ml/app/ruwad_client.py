"""Thin HTTP client for the NestJS backend — the training CLI's only way of
reading real data or reporting results. Never touches Postgres directly
(see docs/ml-training-methodology.md's "who owns what" section): NestJS
remains the single source of truth for the database, this client just
calls its admin API like a human admin would.

Auth: logs in once via POST /auth/login with admin credentials (from
Settings), reads the JWT out of the Set-Cookie header (the login response
body never returns it — see backend/src/auth/jwt.strategy.ts's own doc
comment on why Bearer auth exists at all), and reuses it as
`Authorization: Bearer <token>` for every subsequent call. class
JwtStrategy already accepts Bearer tokens for exactly this reason.
"""
from __future__ import annotations

import re
from typing import Any

import requests

from .config import Settings


class RuwadApiError(RuntimeError):
    """Raised for any non-2xx response from the backend — message is a
    short, safe summary, never the raw response body (which could contain
    stack traces in dev mode)."""


class RuwadClient:
    def __init__(self, settings: Settings):
        self._base = settings.ruwad_api_base_url.rstrip("/")
        self._email = settings.ruwad_admin_email
        self._password = settings.ruwad_admin_password
        self._session = requests.Session()
        self._token: str | None = None

    def login(self) -> None:
        if not self._email or not self._password:
            raise RuwadApiError("RUWAD_ADMIN_EMAIL / RUWAD_ADMIN_PASSWORD are not set in ml/.env")
        res = self._session.post(f"{self._base}/auth/login", json={"email": self._email, "password": self._password}, timeout=15)
        if not res.ok:
            raise RuwadApiError(f"Login failed (HTTP {res.status_code}) — check RUWAD_ADMIN_EMAIL/PASSWORD and that they belong to an admin account")
        token = self._extract_token(res)
        if not token:
            raise RuwadApiError("Login succeeded but no auth token was found in the response cookies")
        self._token = token

    @staticmethod
    def _extract_token(res: requests.Response) -> str | None:
        for cookie in res.cookies:
            if cookie.name == "ruwad_token":
                return cookie.value
        # requests sometimes folds Set-Cookie into a single header string.
        raw = res.headers.get("Set-Cookie", "")
        m = re.search(r"ruwad_token=([^;]+)", raw)
        return m.group(1) if m else None

    def _headers(self) -> dict[str, str]:
        if not self._token:
            self.login()
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        res = self._session.get(f"{self._base}{path}", headers=self._headers(), params=params, timeout=30)
        if res.status_code == 401 and self._token:
            # Token may have expired mid-run — retry once after a fresh login.
            self._token = None
            res = self._session.get(f"{self._base}{path}", headers=self._headers(), params=params, timeout=30)
        if not res.ok:
            raise RuwadApiError(f"GET {path} failed (HTTP {res.status_code})")
        return res.json()

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        res = self._session.post(f"{self._base}{path}", headers=self._headers(), json=body, timeout=30)
        if res.status_code == 401 and self._token:
            self._token = None
            res = self._session.post(f"{self._base}{path}", headers=self._headers(), json=body, timeout=30)
        if not res.ok:
            raise RuwadApiError(f"POST {path} failed (HTTP {res.status_code}): {res.text[:300]}")
        return res.json()

    # ---- Phase 1C endpoints (dataset + readiness) ----
    def fetch_targets(self) -> list[dict[str, Any]]:
        return self._get("/ml-data/targets")

    def fetch_readiness(self, target: str) -> dict[str, Any]:
        return self._get(f"/ml-data/readiness/{target}")

    def fetch_export(self, target: str, *, min_confidence: float | None = None, verified_only: bool = False, include_identifiers: bool = True) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"target": target, "format": "json", "includeIdentifiers": str(include_identifiers).lower()}
        if min_confidence is not None:
            params["minConfidence"] = min_confidence
        if verified_only:
            params["verifiedOnly"] = "true"
        return self._get("/ml-data/export", params=params)

    # ---- Phase 2A endpoints (registry + training runs) ----
    def register_model(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/ml-data/models", payload)

    def record_training_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/ml-data/training-runs", payload)
