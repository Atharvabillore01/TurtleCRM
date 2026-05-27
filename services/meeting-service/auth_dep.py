"""
FastAPI dependency: get_current_team_user(request).

Extracts the team_users.id UUID from the JWT carried in the Authorization
header (`Bearer <jwt>`) or the `access_token` cookie. Verifies the JWT
signature against the shared JWT_SECRET, checks `userType == 'internal'`,
and returns the UUID for downstream proc calls.

This is the SINGLE source of internal-user identity inside meeting-service.
NO route handler should ever read `created_by` / `validated_by` /
`changed_by` from the request body — those values MUST come from this
dependency. That's the privilege-escalation gate.

Failure modes:
  - Missing / malformed JWT       → HTTP 401 missing_credentials
  - Bad signature / expired       → HTTP 401 invalid_token
  - userType != 'internal'        → HTTP 403 forbidden
  - userId not a UUID             → HTTP 401 invalid_token (legacy 'google:xxx'
                                    JWTs are rejected — re-login required)
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt

from config import settings


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "reason": str(e)},
        )


def _extract_bearer(request: Request) -> str:
    # Header first, cookie fallback (matches set_token_cookies in auth-service)
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    cookie = request.cookies.get("access_token")
    if cookie:
        return cookie
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": "missing_credentials"},
    )


def get_current_team_user(request: Request) -> UUID:
    """
    Returns the team_users.id UUID of the authenticated internal-app user.
    Inject as: `team_user_id: UUID = Depends(get_current_team_user)`.
    """
    token = _extract_bearer(request)
    payload = _decode_token(token)

    if payload.get("userType") != "internal":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "forbidden", "reason": "internal-only endpoint"},
        )

    user_id_raw = payload.get("userId")
    if not user_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "reason": "userId missing"},
        )

    try:
        return UUID(str(user_id_raw))
    except (ValueError, TypeError):
        # Legacy 'google:<sub>' tokens fall through here. Force re-login so the
        # new OAuth flow can issue a JWT with a real team_users.id UUID.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_token",
                "reason": "legacy userId — please log in again",
            },
        )


# Convenience export so routes can `from auth_dep import CurrentTeamUser`
CurrentTeamUser = Depends(get_current_team_user)
