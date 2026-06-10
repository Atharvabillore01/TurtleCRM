from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from jose import JWTError

from redis_client import get_redis
from jwt_utils import verify_refresh_token, refresh_token_key, refresh_token_ttl, sign_access_token
from eventbus import publish_event
from auth_utils import set_access_cookie
from logger import get_logger

router = APIRouter(tags=["auth"])
logger = get_logger("auth-service")


@router.post("/auth/refresh")
async def refresh_tokens(request: Request, response: Response):
    """
    Mint a fresh access token for an EXISTING session.

    Session model (non-rotating): the refresh token is a stable, server-side
    session credential. Redis (`refresh:{userId}:{tokenId}`) is the source of
    truth for validity — present ⇒ session alive, deleted ⇒ revoked (logout /
    admin). We do NOT delete or re-issue the refresh token here, so concurrent
    or retried refreshes from the same browser can never invalidate each other
    (the single-use rotation that caused spurious logouts is gone). The session
    ends when the refresh JWT/Redis key expires (REFRESH_TTL after login) or is
    explicitly revoked.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")

    try:
        payload = verify_refresh_token(token)
    except JWTError:
        logger.warning("token_refresh_failed", extra={"reason": "invalid_or_expired_token"})
        raise HTTPException(401, "Invalid or expired refresh token")

    user_id = payload["userId"]
    token_id = payload["tokenId"]
    session_id = payload["sessionId"]
    user_type = payload.get("userType", "client")
    role = payload.get("role", user_type)

    r = get_redis()
    key = refresh_token_key(user_id, token_id)
    stored = await r.get(key)

    if not stored:
        logger.warning("token_refresh_failed", extra={"reason": "session_revoked_or_expired", "user_id": user_id})
        raise HTTPException(401, "Session revoked or expired")

    # Sliding session: extend the server-side session lifetime on activity.
    # (Capped by the refresh JWT's own exp; a fresh login re-issues the JWT.)
    await r.expire(key, refresh_token_ttl())

    # Mint a NEW access token bound to the SAME session. Refresh token untouched.
    access_token = sign_access_token(user_id, user_type, role, session_id)

    await publish_event("auth.token.refreshed", {
        "topic": "auth.token.refreshed",
        "userId": user_id,
        "sessionId": session_id,
        "refreshedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("token_refreshed", extra={"user_id": user_id, "session_id": session_id})

    set_access_cookie(response, access_token)
    return {"accessToken": access_token}


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if token:
        try:
            payload = verify_refresh_token(token)
            key = refresh_token_key(payload["userId"], payload["tokenId"])
            await get_redis().delete(key)
            logger.info("logout", extra={"user_id": payload["userId"]})
        except JWTError:
            logger.warning("logout_with_invalid_token")

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/auth")
    return {"message": "Logged out"}
