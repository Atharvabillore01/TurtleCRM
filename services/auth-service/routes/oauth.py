import json
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from eventbus import publish_event
from config import settings
from auth_utils import issue_tokens, set_token_cookies
from db.team_procs import (
    proc_is_internal_user_allowed,
    proc_create_team_user_via_oauth,
    proc_record_auth_event,
)
from redis_client import get_redis
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
async def google_callback(request: Request, code: str | None = None, error: str | None = None):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")

    if error or not code:
        logger.warning("oauth_callback_denied", extra={"provider": "google", "error": error, "ip": ip})
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
            logger.error("oauth_token_exchange_failed", extra={"provider": "google", "status": token_resp.status_code, "ip": ip})
            raise HTTPException(502, "Failed to exchange OAuth code")

        token_data = token_resp.json()

        profile_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )

        if profile_resp.status_code != 200:
            logger.error("oauth_profile_fetch_failed", extra={"provider": "google", "status": profile_resp.status_code, "ip": ip})
            raise HTTPException(502, "Failed to fetch Google profile")

        profile = profile_resp.json()

    user_id = f"google:{profile['sub']}"
    access_token, refresh_token, session_id = await issue_tokens(user_id, "advisor", "advisor")

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

    logger.info("oauth_login_success", extra={"provider": "google", "user_id": user_id, "session_id": session_id, "ip": ip})

    redirect = RedirectResponse(f"{settings.advisor_app_url}/auth/callback")
    set_token_cookies(redirect, access_token, refresh_token)
    return redirect


# ── Internal Team OAuth ────────────────────────────────────────────────────────

@router.get("/internal/google")
async def internal_google_redirect():
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_internal_callback_url,
        "response_type": "code",
        "scope": "openid email profile https://www.googleapis.com/auth/calendar.events",
        "access_type": "offline",
        "prompt": "consent",
    })
    logger.info("oauth_redirect", extra={"provider": "google", "app": "internal"})
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/internal/google/callback")
async def internal_google_callback(request: Request, code: str | None = None, error: str | None = None):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")

    if error or not code:
        logger.warning("oauth_callback_denied", extra={"provider": "google", "app": "internal", "error": error, "ip": ip})
        return RedirectResponse(f"{settings.internal_app_url}/auth/error?reason=oauth_denied")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_internal_callback_url,
            "grant_type": "authorization_code",
        })

        if token_resp.status_code != 200:
            logger.error("oauth_token_exchange_failed", extra={"provider": "google", "app": "internal", "status": token_resp.status_code, "ip": ip})
            raise HTTPException(502, "Failed to exchange OAuth code")

        token_data = token_resp.json()

        profile_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )

        if profile_resp.status_code != 200:
            logger.error("oauth_profile_fetch_failed", extra={"provider": "google", "app": "internal", "status": profile_resp.status_code, "ip": ip})
            raise HTTPException(502, "Failed to fetch Google profile")

        profile = profile_resp.json()

    # Check allowlist via DB proc (domain-whitelist read from application_config)
    email = (profile.get("email") or "").lower()
    if not await proc_is_internal_user_allowed(email):
        logger.warning("oauth_access_denied", extra={"email": email, "app": "internal", "ip": ip})
        # Audit: rejected admission (no team_user provisioned, so segment='system')
        await proc_record_auth_event(
            event_type="auth.login.failure",
            segment="system",
            user_id=None,
            payload={
                "reason":   "admission_denied",
                "method":   "google_oauth",
                "email":    email,
                "ip":       ip,
                "provider_sub": profile.get("sub"),
            },
        )
        return RedirectResponse(f"{settings.internal_app_url}/auth/error?reason=not_authorised")

    # Resolve or provision a real team_users row, get the canonical UUID.
    # This UUID is what every downstream audit column (meetings.created_by,
    # extractions.validated_by, extraction_field_audit.changed_by, …) will store.
    team_user = await proc_create_team_user_via_oauth(
        provider="google",
        provider_user_id=profile["sub"],
        email=email,
        display_name=profile.get("name") or profile.get("given_name"),
        request_ip=ip,
    )

    user_id = team_user["user_id"]              # UUID string
    role_code = team_user.get("role_code", "team")
    is_first_login = team_user.get("is_first_login", False)

    # Store Google OAuth tokens in Redis so meeting-service can create Calendar events.
    # Keyed by the team_users.id UUID — same id every downstream service uses.
    redis = get_redis()
    await redis.setex(
        f"google_cal_token:{user_id}",
        60 * 24 * 3600,
        json.dumps({
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token"),
            "email": email,
        }),
    )

    access_token, refresh_token, session_id = await issue_tokens(user_id, "internal", role_code)

    # DB-side audit (immutable, queryable via domain_events). Best-effort —
    # any failure here is logged and swallowed; login still completes.
    await proc_record_auth_event(
        event_type="auth.login.success",
        segment="team",
        user_id=user_id,
        payload={
            "method":          "google_oauth",
            "role_code":       role_code,
            "is_first_login":  is_first_login,
            "session_id":      session_id,
            "ip":              ip,
            "user_agent":      user_agent[:200] if user_agent else None,
        },
    )

    # Message-bus fan-out (consumed by notification-service for new-device emails etc.)
    await publish_event("auth.login.success", {
        "topic": "auth.login.success",
        "userId": user_id,
        "userType": "internal",
        "role": role_code,
        "isFirstLogin": is_first_login,
        "authMethod": "oauth",
        "sessionId": session_id,
        "ip": ip,
        "userAgent": user_agent,
        "loggedInAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("oauth_login_success", extra={
        "provider": "google",
        "app": "internal",
        "user_id": user_id,
        "role": role_code,
        "is_first_login": is_first_login,
        "session_id": session_id,
        "ip": ip,
    })

    redirect = RedirectResponse(f"{settings.internal_app_url}/auth/callback")
    set_token_cookies(redirect, access_token, refresh_token)
    return redirect
