import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response
import httpx
from pydantic import BaseModel, field_validator
import re

from redis_client import get_redis
from jwt_utils import sign_access_token, sign_refresh_token, refresh_token_key, refresh_token_ttl
from eventbus import publish_event
from config import settings
from logger import get_logger

router = APIRouter(prefix="/auth/client", tags=["client"])
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


def _mask(dest: str) -> str:
    """Mask a phone number or email for safe log output."""
    if "@" in dest:
        user, domain = dest.split("@", 1)
        return f"{user[:1]}***@{domain}"
    return f"{dest[:2]}****{dest[-4:]}" if len(dest) > 6 else "****"


class RequestOTPBody(BaseModel):
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


class VerifyOTPBody(BaseModel):
    requestId: str
    destination: str
    otp: str

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v


@router.post("/request-otp", status_code=202)
async def request_otp(body: RequestOTPBody):
    request_id = str(uuid.uuid4())
    r = get_redis()

    pending_key = f"otp:pending:{request_id}"
    await r.setex(
        pending_key,
        settings.otp_expires_in_seconds,
        json.dumps({"channel": body.channel, "destination": body.destination, "verified": False}),
    )

    await publish_event("auth.otp.requested", {
        "topic": "auth.otp.requested",
        "userId": body.destination,
        "channel": body.channel,
        "target": body.destination,
        "userType": "client",
        "requestedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "otp_requested",
        extra={
            "request_id": request_id,
            "channel": body.channel,
            "destination": _mask(body.destination),
            "expires_in": settings.otp_expires_in_seconds,
        },
    )

    return {
        "requestId": request_id,
        "expiresIn": settings.otp_expires_in_seconds,
        "message": f"OTP sent via {body.channel}",
    }


@router.post("/verify-otp")
async def verify_otp(body: VerifyOTPBody, response: Response):
    r = get_redis()

    pending_key = f"otp:pending:{body.requestId}"
    pending_raw = await r.get(pending_key)

    if not pending_raw:
        logger.warning(
            "otp_verify_failed",
            extra={"reason": "request_not_found", "request_id": body.requestId},
        )
        raise HTTPException(400, "OTP request not found or expired")

    pending = json.loads(pending_raw)

    if pending["destination"] != body.destination:
        logger.warning(
            "otp_verify_failed",
            extra={
                "reason": "destination_mismatch",
                "request_id": body.requestId,
                "destination": _mask(body.destination),
            },
        )
        raise HTTPException(400, "Destination does not match OTP request")

    verification = await _verify_otp_with_service(
        channel=pending["channel"],
        destination=body.destination,
        otp=body.otp,
        user_id=body.destination,
        user_type="client",
    )

    if not verification["valid"]:
        logger.warning(
            "otp_verify_failed",
            extra={
                "reason": verification.get("reason", "invalid_otp"),
                "request_id": body.requestId,
                "destination": _mask(body.destination),
            },
        )
        raise HTTPException(verification.get("status_code", 400), verification["error"])

    await r.delete(pending_key)

    user_id = body.destination
    session_id = str(uuid.uuid4())

    access_token = sign_access_token(user_id, "client", "client", session_id)
    refresh_token, token_id = sign_refresh_token(user_id, session_id)

    await r.setex(refresh_token_key(user_id, token_id), refresh_token_ttl(), session_id)

    await publish_event("auth.otp.verified", {
        "topic": "auth.otp.verified",
        "userId": user_id,
        "channel": pending["channel"],
        "userType": "client",
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "otp_verified",
        extra={
            "user_id": _mask(user_id),
            "session_id": session_id,
            "user_type": "client",
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

    return {"accessToken": access_token, "refreshToken": refresh_token, "sessionId": session_id}
