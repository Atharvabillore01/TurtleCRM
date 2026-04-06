import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
import httpx
from pydantic import BaseModel, field_validator
from passlib.context import CryptContext
import re

from redis_client import get_redis
from jwt_utils import sign_access_token, sign_refresh_token, refresh_token_key, refresh_token_ttl
from eventbus import publish_event
from config import settings
from logger import get_logger

router = APIRouter(prefix="/auth/advisor", tags=["advisor"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = get_logger("auth-service")


async def _verify_otp_with_service(*, channel: str, destination: str, otp: str, user_id: str, user_type: str) -> dict:
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


class AdvisorLoginBody(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not 3 <= len(v) <= 64:
            raise ValueError("username must be 3-64 characters")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not 8 <= len(v) <= 128:
            raise ValueError("password must be 8-128 characters")
        return v


class AdvisorVerifyOTPBody(BaseModel):
    sessionId: str
    otp: str

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v


async def _find_advisor(username: str) -> dict | None:
    # Stub — replace with user-service HTTP call
    # e.g.: async with httpx.AsyncClient() as c: resp = await c.get(f"{settings.user_service_url}/users/advisor/{username}")
    return None


@router.post("/login")
async def advisor_login(body: AdvisorLoginBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")

    logger.info(
        "advisor_login_attempt",
        extra={"username": body.username, "ip": ip},
    )

    advisor = await _find_advisor(body.username)

    if not advisor:
        # Constant-time response — don't reveal whether user exists
        pwd_ctx.verify(body.password, "$2b$12$invalidhashpadding000000000000000000000000000000000000000")
        await publish_event("auth.login.failed", {
            "topic": "auth.login.failed",
            "userId": None,
            "userType": "advisor",
            "authMethod": "password",
            "reason": "user_not_found",
            "ip": ip,
            "userAgent": user_agent,
            "failedAt": datetime.now(timezone.utc).isoformat(),
        })
        logger.warning(
            "advisor_login_failed",
            extra={"reason": "user_not_found", "username": body.username, "ip": ip},
        )
        raise HTTPException(401, "Invalid credentials")

    if not pwd_ctx.verify(body.password, advisor["passwordHash"]):
        await publish_event("auth.login.failed", {
            "topic": "auth.login.failed",
            "userId": advisor["id"],
            "userType": "advisor",
            "authMethod": "password",
            "reason": "invalid_password",
            "ip": ip,
            "userAgent": user_agent,
            "failedAt": datetime.now(timezone.utc).isoformat(),
        })
        logger.warning(
            "advisor_login_failed",
            extra={"reason": "invalid_password", "advisor_id": advisor["id"], "ip": ip},
        )
        raise HTTPException(401, "Invalid credentials")

    session_id = str(uuid.uuid4())
    r = get_redis()

    session_key = f"advisor:session:{session_id}"
    await r.setex(
        session_key,
        settings.otp_expires_in_seconds,
        json.dumps({
            "advisorId": advisor["id"],
            "role": advisor["role"],
            "step": "awaiting_otp",
            "otpChannel": advisor["otpChannel"],
            "otpTarget": advisor["otpTarget"],
        }),
    )

    await publish_event("auth.otp.requested", {
        "topic": "auth.otp.requested",
        "userId": advisor["id"],
        "channel": advisor["otpChannel"],
        "target": advisor["otpTarget"],
        "userType": "advisor",
        "requestedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "advisor_otp_dispatched",
        extra={
            "advisor_id": advisor["id"],
            "otp_channel": advisor["otpChannel"],
            "session_id": session_id,
        },
    )

    return {
        "sessionId": session_id,
        "message": f"OTP sent via {advisor['otpChannel']}",
        "expiresIn": settings.otp_expires_in_seconds,
    }


@router.post("/verify-otp")
async def advisor_verify_otp(body: AdvisorVerifyOTPBody, request: Request, response: Response):
    r = get_redis()
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")

    session_key = f"advisor:session:{body.sessionId}"
    session_raw = await r.get(session_key)

    if not session_raw:
        logger.warning(
            "advisor_otp_verify_failed",
            extra={"reason": "session_not_found", "session_id": body.sessionId, "ip": ip},
        )
        raise HTTPException(400, "Session not found or expired. Please log in again.")

    session = json.loads(session_raw)

    if session["step"] != "awaiting_otp":
        logger.warning(
            "advisor_otp_verify_failed",
            extra={"reason": "invalid_session_state", "step": session["step"], "ip": ip},
        )
        raise HTTPException(400, "Invalid session state")

    verification = await _verify_otp_with_service(
        channel=session["otpChannel"],
        destination=session["otpTarget"],
        otp=body.otp,
        user_id=session["advisorId"],
        user_type="advisor",
    )

    if not verification["valid"]:
        logger.warning(
            "advisor_otp_verify_failed",
            extra={
                "reason": verification.get("reason", "invalid_otp"),
                "advisor_id": session["advisorId"],
                "ip": ip,
            },
        )
        raise HTTPException(verification.get("status_code", 400), verification["error"])

    await r.delete(session_key)

    new_session_id = str(uuid.uuid4())
    access_token = sign_access_token(session["advisorId"], "advisor", session["role"], new_session_id)
    refresh_token, token_id = sign_refresh_token(session["advisorId"], new_session_id)

    await r.setex(
        refresh_token_key(session["advisorId"], token_id),
        refresh_token_ttl(),
        new_session_id,
    )

    await publish_event("auth.login.success", {
        "topic": "auth.login.success",
        "userId": session["advisorId"],
        "userType": "advisor",
        "authMethod": "otp",
        "sessionId": new_session_id,
        "ip": ip,
        "userAgent": user_agent,
        "loggedInAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "advisor_login_success",
        extra={
            "advisor_id": session["advisorId"],
            "role": session["role"],
            "session_id": new_session_id,
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

    return {"accessToken": access_token, "refreshToken": refresh_token, "sessionId": new_session_id}
