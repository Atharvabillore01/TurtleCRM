import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response
from jose import JWTError
from pydantic import BaseModel

from redis_client import get_redis
from jwt_utils import (
    verify_refresh_token,
    sign_access_token,
    sign_refresh_token,
    refresh_token_key,
    refresh_token_ttl,
)
from eventbus import publish_event
from config import settings
from logger import get_logger

router = APIRouter(tags=["auth"])
logger = get_logger("auth-service")


class RefreshBody(BaseModel):
    refreshToken: str


class LogoutBody(BaseModel):
    refreshToken: str | None = None


@router.post("/auth/refresh")
async def refresh_tokens(body: RefreshBody, response: Response):
    try:
        payload = verify_refresh_token(body.refreshToken)
    except JWTError:
        logger.warning("token_refresh_failed", extra={"reason": "invalid_or_expired_token"})
        raise HTTPException(401, "Invalid or expired refresh token")

    user_id = payload["userId"]
    session_id = payload["sessionId"]
    token_id = payload["tokenId"]

    r = get_redis()
    key = refresh_token_key(user_id, token_id)
    stored = await r.get(key)

    if not stored:
        logger.warning(
            "token_refresh_failed",
            extra={"reason": "token_revoked_or_used", "user_id": user_id},
        )
        raise HTTPException(401, "Refresh token revoked or already used")

    await r.delete(key)

    new_session_id = str(uuid.uuid4())
    new_access_token = sign_access_token(user_id, "client", "client", new_session_id)
    new_refresh_token, new_token_id = sign_refresh_token(user_id, new_session_id)

    await r.setex(refresh_token_key(user_id, new_token_id), refresh_token_ttl(), new_session_id)

    await publish_event("auth.token.refreshed", {
        "topic": "auth.token.refreshed",
        "userId": user_id,
        "sessionId": new_session_id,
        "refreshedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "token_refreshed",
        extra={"user_id": user_id, "new_session_id": new_session_id},
    )

    response.set_cookie(
        "access_token",
        new_access_token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=15 * 60,
        secure=settings.node_env == "production",
    )

    return {"accessToken": new_access_token, "refreshToken": new_refresh_token}


@router.post("/auth/logout")
async def logout(body: LogoutBody, response: Response):
    if body.refreshToken:
        try:
            payload = verify_refresh_token(body.refreshToken)
            key = refresh_token_key(payload["userId"], payload["tokenId"])
            await get_redis().delete(key)
            logger.info("logout", extra={"user_id": payload["userId"]})
        except JWTError:
            logger.warning("logout_with_invalid_token")

    response.delete_cookie("access_token", path="/")
    return {"message": "Logged out"}
