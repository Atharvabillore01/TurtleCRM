import uuid

import httpx
from fastapi import Response

from config import settings
from redis_client import get_redis
from jwt_utils import sign_access_token, sign_refresh_token, refresh_token_key, refresh_token_ttl, REFRESH_TTL


def mask(dest: str) -> str:
    """Mask a phone number or email for safe log output."""
    if "@" in dest:
        user, domain = dest.split("@", 1)
        return f"{user[:1]}***@{domain}"
    return f"{dest[:2]}****{dest[-4:]}" if len(dest) > 6 else "****"


async def verify_otp_with_service(
    *, channel: str, destination: str, otp: str, user_id: str, user_type: str
) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.otp_service_url}/otp/verify",
                json={
                    "channel": channel,
                    "destination": destination,
                    "otp": otp,
                    "userId": user_id,
                    "userType": user_type,
                },
            )
    except httpx.HTTPError:
        return {
            "valid": False,
            "error": "OTP service unavailable",
            "reason": "service_unavailable",
            "status_code": 503,
        }
    data = resp.json()
    if resp.is_success:
        return {"valid": True}
    return {
        "valid": False,
        "error": data.get("error", "Invalid or expired OTP"),
        "attemptsLeft": data.get("attemptsLeft"),
        "reason": data.get("reason"),
        "status_code": resp.status_code,
    }


async def issue_tokens(user_id: str, user_type: str, role: str) -> tuple[str, str, str]:
    """Generate access + refresh tokens, persist refresh in Redis.

    Returns (access_token, refresh_token, session_id).
    """
    session_id = str(uuid.uuid4())
    r = get_redis()
    access_token = sign_access_token(user_id, user_type, role, session_id)
    refresh_token, token_id = sign_refresh_token(user_id, session_id, user_type, role)
    await r.setex(refresh_token_key(user_id, token_id), refresh_token_ttl(), session_id)
    return access_token, refresh_token, session_id


def set_token_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = settings.node_env == "production"
    response.set_cookie(
        "access_token", access_token,
        httponly=True, samesite="lax", path="/",
        max_age=15 * 60, secure=secure,
    )
    # path="/auth" — refresh token is only sent to /auth/* endpoints
    response.set_cookie(
        "refresh_token", refresh_token,
        httponly=True, samesite="lax", path="/auth",
        max_age=REFRESH_TTL, secure=secure,
    )
