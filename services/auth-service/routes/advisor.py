import json
import re
import uuid
from datetime import datetime, timezone

import bcrypt as bcrypt_lib
import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, field_validator

from redis_client import get_redis
from eventbus import publish_event
from config import settings
from auth_utils import verify_otp_with_service, issue_tokens, set_token_cookies, mask
from logger import get_logger

router = APIRouter(prefix="/auth/advisor", tags=["advisor"])
logger = get_logger("auth-service")

# Pre-computed at startup so the constant-time dummy check always has a valid hash
_DUMMY_HASH: bytes = bcrypt_lib.hashpw(b"dummy-constant-time", bcrypt_lib.gensalt())


async def _find_advisor(username: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.user_service_url}/advisors/by-username/{username}")
    except httpx.RequestError:
        raise HTTPException(502, "User service unavailable")
    if resp.status_code == 404:
        return None
    if not resp.is_success:
        raise HTTPException(502, "User service error")
    return resp.json()


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


class AdvisorRequestOTPBody(BaseModel):
    channel: str  # "sms" | "email"
    destination: str

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v: str) -> str:
        if v not in ("sms", "email"):
            raise ValueError("channel must be sms or email")
        return v

    @field_validator("destination")
    @classmethod
    def validate_destination(cls, v: str) -> str:
        phone = re.match(r"^\+?[1-9]\d{6,14}$", v)
        email = re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v)
        if not phone and not email:
            raise ValueError("destination must be a valid phone number or email")
        return v


class AdvisorVerifyOTPBody(BaseModel):
    requestId: str
    destination: str
    otp: str

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v


class AdvisorRegisterBody(BaseModel):
    username: str
    email: str
    password: str
    otp_channel: str = "email"
    otp_target: str | None = None  # phone if SMS; defaults to email

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
        if not 8 <= len(v) <= 128:
            raise ValueError("password must be 8-128 characters")
        return v

    @field_validator("otp_channel")
    @classmethod
    def validate_otp_channel(cls, v: str) -> str:
        if v not in ("email", "sms"):
            raise ValueError("otp_channel must be email or sms")
        return v


@router.post("/register", status_code=201)
async def advisor_register(body: AdvisorRegisterBody):
    if body.otp_channel == "sms" and not body.otp_target:
        raise HTTPException(400, "otp_target (phone number) is required when otp_channel is sms")

    otp_target = body.otp_target or body.email

    logger.info(
        "advisor_register_attempt",
        extra={"username": body.username, "email": body.email, "otp_channel": body.otp_channel},
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.user_service_url}/advisors",
                json={
                    "username": body.username,
                    "email": body.email,
                    "password": body.password,
                    "otp_channel": body.otp_channel,
                    "otp_target": otp_target,
                },
            )
    except httpx.RequestError as exc:
        logger.error("user_service_unreachable", extra={"error": str(exc)})
        raise HTTPException(502, "User service unavailable")

    if resp.status_code == 409:
        raise HTTPException(409, "Username or email already exists")

    if resp.status_code != 201:
        logger.error("advisor_register_failed", extra={"status": resp.status_code, "body": resp.text})
        raise HTTPException(500, "Failed to create advisor account")

    data = resp.json()
    logger.info("advisor_registered", extra={"advisor_id": data.get("id"), "username": data.get("username")})
    return {
        "id": data["id"],
        "username": data["username"],
        "email": data["email"],
        "message": "Account created. You can now log in.",
    }


@router.post("/request-otp", status_code=202)
async def advisor_request_otp(body: AdvisorRequestOTPBody):
    request_id = str(uuid.uuid4())
    r = get_redis()

    await r.setex(
        f"otp:pending:{request_id}",
        settings.otp_expires_in_seconds,
        json.dumps({"channel": body.channel, "destination": body.destination, "verified": False}),
    )

    await publish_event("auth.otp.requested", {
        "topic": "auth.otp.requested",
        "userId": body.destination,
        "channel": body.channel,
        "target": body.destination,
        "userType": "advisor",
        "requestedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "advisor_otp_requested",
        extra={
            "request_id": request_id,
            "channel": body.channel,
            "destination": mask(body.destination),
            "expires_in": settings.otp_expires_in_seconds,
        },
    )

    return {
        "requestId": request_id,
        "expiresIn": settings.otp_expires_in_seconds,
        "message": f"OTP sent via {body.channel}",
    }


@router.post("/login")
async def advisor_login(body: AdvisorLoginBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")

    logger.info("advisor_login_attempt", extra={"username": body.username, "ip": ip})

    advisor = await _find_advisor(body.username)

    if not advisor:
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
        logger.warning("advisor_login_failed", extra={"reason": "user_not_found", "username": body.username, "ip": ip})
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
        logger.warning("advisor_login_failed", extra={"reason": "invalid_password", "advisor_id": advisor["id"], "ip": ip})
        raise HTTPException(401, "Invalid credentials")

    session_id = str(uuid.uuid4())
    r = get_redis()
    await r.setex(
        f"advisor:session:{session_id}",
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
        extra={"advisor_id": advisor["id"], "otp_channel": advisor["otpChannel"], "session_id": session_id},
    )

    return {
        "sessionId": session_id,
        "message": f"OTP sent via {advisor['otpChannel']}",
        "expiresIn": settings.otp_expires_in_seconds,
    }


@router.post("/verify-otp")
async def advisor_verify_otp(body: AdvisorVerifyOTPBody, request: Request, response: Response):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    r = get_redis()

    pending_raw = await r.get(f"otp:pending:{body.requestId}")
    if not pending_raw:
        logger.warning("advisor_otp_verify_failed", extra={"reason": "request_not_found", "request_id": body.requestId, "ip": ip})
        raise HTTPException(400, "OTP request not found or expired")

    pending = json.loads(pending_raw)

    if pending["destination"] != body.destination:
        logger.warning(
            "advisor_otp_verify_failed",
            extra={"reason": "destination_mismatch", "request_id": body.requestId, "destination": mask(body.destination), "ip": ip},
        )
        raise HTTPException(400, "Destination does not match OTP request")

    verification = await verify_otp_with_service(
        channel=pending["channel"],
        destination=body.destination,
        otp=body.otp,
        user_id=body.destination,
        user_type="advisor",
    )

    if not verification["valid"]:
        logger.warning(
            "advisor_otp_verify_failed",
            extra={"reason": verification.get("reason", "invalid_otp"), "request_id": body.requestId, "destination": mask(body.destination), "ip": ip},
        )
        raise HTTPException(verification.get("status_code", 400), verification["error"])

    await r.delete(f"otp:pending:{body.requestId}")

    access_token, refresh_token, session_id = await issue_tokens(body.destination, "advisor", "advisor")

    await publish_event("auth.otp.verified", {
        "topic": "auth.otp.verified",
        "userId": body.destination,
        "channel": pending["channel"],
        "userType": "advisor",
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
    })

    await publish_event("auth.login.success", {
        "topic": "auth.login.success",
        "userId": body.destination,
        "userType": "advisor",
        "authMethod": "otp",
        "sessionId": session_id,
        "ip": ip,
        "userAgent": user_agent,
        "loggedInAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("advisor_otp_verified", extra={"user_id": mask(body.destination), "session_id": session_id})

    set_token_cookies(response, access_token, refresh_token)
    return {"accessToken": access_token, "sessionId": session_id}
