import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from redis_client import get_redis
from jwt_utils import sign_access_token, sign_refresh_token, refresh_token_key, refresh_token_ttl
from eventbus import publish_event
from config import settings
from logger import get_logger

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])
logger = get_logger("auth-service")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("/google")
async def google_redirect():
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    })
    logger.info("oauth_redirect", extra={"provider": "google"})
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
async def google_callback(request: Request, response: Response, code: str | None = None, error: str | None = None):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")

    if error or not code:
        logger.warning(
            "oauth_callback_denied",
            extra={"provider": "google", "error": error, "ip": ip},
        )
        return RedirectResponse(f"{settings.advisor_app_url}/auth/error?reason=oauth_denied")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_callback_url,
            "grant_type": "authorization_code",
        })

        if token_resp.status_code != 200:
            logger.error(
                "oauth_token_exchange_failed",
                extra={"provider": "google", "status": token_resp.status_code, "ip": ip},
            )
            raise HTTPException(502, "Failed to exchange OAuth code")

        token_data = token_resp.json()

        profile_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )

        if profile_resp.status_code != 200:
            logger.error(
                "oauth_profile_fetch_failed",
                extra={"provider": "google", "status": profile_resp.status_code, "ip": ip},
            )
            raise HTTPException(502, "Failed to fetch Google profile")

        profile = profile_resp.json()

    user_id = f"google:{profile['sub']}"
    session_id = str(uuid.uuid4())
    r = get_redis()

    access_token = sign_access_token(user_id, "advisor", "advisor", session_id)
    refresh_token, token_id = sign_refresh_token(user_id, session_id)

    await r.setex(refresh_token_key(user_id, token_id), refresh_token_ttl(), session_id)

    await publish_event("auth.login.success", {
        "topic": "auth.login.success",
        "userId": user_id,
        "userType": "advisor",
        "authMethod": "oauth",
        "sessionId": session_id,
        "ip": ip,
        "userAgent": user_agent,
        "loggedInAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "oauth_login_success",
        extra={
            "provider": "google",
            "user_id": user_id,
            "session_id": session_id,
            "ip": ip,
        },
    )

    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=15 * 60,
        secure=settings.node_env == "production",
    )

    redirect_url = f"{settings.advisor_app_url}/auth/callback?refresh_token={refresh_token}"
    return RedirectResponse(redirect_url)
