import json
import uuid
from datetime import datetime, timezone

import bcrypt as bcrypt_lib
import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, field_validator
import re

from redis_client import get_redis
from jwt_utils import sign_access_token, sign_refresh_token, refresh_token_key, refresh_token_ttl
from eventbus import publish_event
from config import settings
from logger import get_logger

router = APIRouter(prefix="/auth/advisor", tags=["advisor"])
logger = get_logger("auth-service")

# Pre-computed at startup so the constant-time dummy check always has a valid hash
_DUMMY_HASH: bytes = bcrypt_lib.hashpw(b"dummy-constant-time", bcrypt_lib.gensalt())


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


class AdvisorRegisterBody(BaseModel):
    username:   str
    email:      str
    password:   str
    otp_channel: str = "email"
    otp_target:  str | None = None   # phone if SMS; defaults to email

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9._-]{3,64}$", v):
            raise ValueError("username must be 3-64 alphanumeric characters (. _ - allowed)")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
            raise ValueError("invalid email address")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("password must be at most 128 characters")
        return v

    @field_validator("otp_channel")
    @classmethod
    def validate_otp_channel(cls, v: str) -> str:
        if v not in ("email", "sms"):
            raise ValueError("otp_channel must be email or sms")
        return v


async def _find_advisor(username: str) -> dict | None:
    # Stub — replace with user-service HTTP call
    # e.g.: async with httpx.AsyncClient() as c: resp = await c.get(f"{settings.user_service_url}/users/advisor/{username}")
    return None


@router.post("/register", status_code=201)
async def advisor_register(body: AdvisorRegisterBody):
    otp_target = body.otp_target or body.email

    if body.otp_channel == "sms" and not body.otp_target:
        raise HTTPException(400, "otp_target (phone number) is required when otp_channel is sms")

    logger.info(
        "advisor_register_attempt",
        extra={"username": body.username, "email": body.email, "otp_channel": body.otp_channel},
    )

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{settings.user_service_url}/advisors",
                json={
                    "username":    body.username,
                    "email":       body.email,
                    "password":    body.password,
                    "otp_channel": body.otp_channel,
                    "otp_target":  otp_target,
                },
                timeout=10.0,
            )
        except httpx.RequestError as exc:
            logger.error("user_service_unreachable", extra={"error": str(exc)})
            raise HTTPException(502, "User service unavailable")

    if resp.status_code == 201:
        data = resp.json()
        logger.info(
            "advisor_registered",
            extra={"advisor_id": data.get("id"), "username": data.get("username")},
        )
        return {
            "id":       data["id"],
            "username": data["username"],
            "email":    data["email"],
            "message":  "Account created. You can now log in.",
        }

    if resp.status_code == 409:
        raise HTTPException(409, "Username or email already exists")

    logger.error(
        "advisor_register_failed",
        extra={"status": resp.status_code, "body": resp.text},
    )
    raise HTTPException(500, "Failed to create advisor account")


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
        bcrypt_lib.checkpw(body.password.encode(), _DUMMY_HASH)
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

    if not bcrypt_lib.checkpw(body.password.encode(), advisor["passwordHash"].encode()):
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
        json.dumps({"advisorId": advisor["id"], "role": advisor["role"], "step": "awaiting_otp"}),
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

    otp_key = f"otp:{session['advisorId']}"
    stored_otp = await r.get(otp_key)

    if not stored_otp or stored_otp != body.otp:
        logger.warning(
            "advisor_otp_verify_failed",
            extra={"reason": "invalid_otp", "advisor_id": session["advisorId"], "ip": ip},
        )
        raise HTTPException(400, "Invalid or expired OTP")

    await r.delete(otp_key, session_key)

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
