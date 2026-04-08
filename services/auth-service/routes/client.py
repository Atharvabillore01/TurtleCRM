import json
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, field_validator

from redis_client import get_redis
from eventbus import publish_event
from config import settings
from auth_utils import verify_otp_with_service, issue_tokens, set_token_cookies, mask
from logger import get_logger

router = APIRouter(prefix="/auth/client", tags=["client"])
logger = get_logger("auth-service")


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
        "userType": "client",
        "requestedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        "otp_requested",
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


@router.post("/verify-otp")
async def verify_otp(body: VerifyOTPBody, response: Response):
    r = get_redis()

    pending_raw = await r.get(f"otp:pending:{body.requestId}")
    if not pending_raw:
        logger.warning("otp_verify_failed", extra={"reason": "request_not_found", "request_id": body.requestId})
        raise HTTPException(400, "OTP request not found or expired")

    pending = json.loads(pending_raw)

    if pending["destination"] != body.destination:
        logger.warning(
            "otp_verify_failed",
            extra={"reason": "destination_mismatch", "request_id": body.requestId, "destination": mask(body.destination)},
        )
        raise HTTPException(400, "Destination does not match OTP request")

    verification = await verify_otp_with_service(
        channel=pending["channel"],
        destination=body.destination,
        otp=body.otp,
        user_id=body.destination,
        user_type="client",
    )

    if not verification["valid"]:
        logger.warning(
            "otp_verify_failed",
            extra={"reason": verification.get("reason", "invalid_otp"), "request_id": body.requestId, "destination": mask(body.destination)},
        )
        raise HTTPException(verification.get("status_code", 400), verification["error"])

    await r.delete(f"otp:pending:{body.requestId}")

    access_token, refresh_token, session_id = await issue_tokens(body.destination, "client", "client")

    await publish_event("auth.otp.verified", {
        "topic": "auth.otp.verified",
        "userId": body.destination,
        "channel": pending["channel"],
        "userType": "client",
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("otp_verified", extra={"user_id": mask(body.destination), "session_id": session_id, "user_type": "client"})

    set_token_cookies(response, access_token, refresh_token)
    return {"accessToken": access_token, "sessionId": session_id}
