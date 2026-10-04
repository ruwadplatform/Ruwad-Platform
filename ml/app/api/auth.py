"""Shared-secret auth for /predict* — mirrors the backend's own
content-refresh.controller.ts pattern (constant-time compare, silently
rejects if the secret is unset). No RUWĀD user/JWT concept applies here;
this service only ever talks to the NestJS backend as a trusted peer, not
to end users.
"""
from __future__ import annotations

import hmac

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


def verify_service_token(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    expected = (request.app.state.settings.ml_service_token or "").strip()
    if not expected:
        # No token configured — this service should never accept
        # prediction traffic in that state, same fail-closed default the
        # backend's ML_SCORING_ENABLED flag uses.
        raise HTTPException(status_code=503, detail="ML_SERVICE_TOKEN is not configured on this service")
    provided = credentials.credentials if credentials else ""
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing service token")
