from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response
from jose import JWTError
from pydantic import BaseModel

from redis_client import get_redis
from jwt_utils import verify_refresh_token, refresh_token_key
from eventbus import publish_event
from auth_utils import issue_tokens, set_auth_cookie
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
    token_id = payload["tokenId"]

    r = get_redis()
    key = refresh_token_key(user_id, token_id)
    stored = await r.get(key)

    if not stored:
        logger.warning("token_refresh_failed", extra={"reason": "token_revoked_or_used", "user_id": user_id})
        raise HTTPException(401, "Refresh token revoked or already used")

    await r.delete(key)

    access_token, refresh_token, session_id = await issue_tokens(user_id, "client", "client")

    await publish_event("auth.token.refreshed", {
        "topic": "auth.token.refreshed",
        "userId": user_id,
        "sessionId": session_id,
        "refreshedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("token_refreshed", extra={"user_id": user_id, "new_session_id": session_id})

    set_auth_cookie(response, access_token)
    return {"accessToken": access_token, "refreshToken": refresh_token}


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
