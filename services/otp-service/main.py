import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
import re

from config import settings
from redis_client import get_redis, close_redis
from otp.validate import validate_otp
from otp.rate_limit import check_rate_limit
from otp.generate import generate_otp
from otp.store import store_otp
from providers.factory import get_otp_provider
from eventbus import start_consumer, disconnect_publisher, publish_event
from consumer import handle_otp_requested
from logger import get_logger

logger = get_logger("otp-service")

_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    _consumer_task = asyncio.create_task(
        start_consumer(
            topic="auth.otp.requested",
            queue_prefix="otp-service-group",
            handler=handle_otp_requested,
        )
    )
    logger.info("otp-service started", extra={"provider": settings.otp_provider, "env": settings.node_env})
    yield
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
    await asyncio.gather(disconnect_publisher(), close_redis(), return_exceptions=True)
    logger.info("otp-service shut down")


app = FastAPI(title="otp-service", lifespan=lifespan)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        "http_request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "client_ip": request.client.host if request.client else "unknown",
        },
    )
    return response


class SendOTPBody(BaseModel):
    channel: str
    destination: str
    userId: str
    userType: str

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v: str) -> str:
        if v not in ("sms", "email"):
            raise ValueError("channel must be sms or email")
        return v

    @field_validator("otp", mode="before", check_fields=False)
    @classmethod
    def noop(cls, v):
        return v


class VerifyOTPBody(BaseModel):
    channel: str
    destination: str
    otp: str
    userId: str
    userType: str

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v


@app.post("/otp/send", status_code=202)
async def send_otp(body: SendOTPBody):
    r = get_redis()

    rate = await check_rate_limit(r, body.destination)
    if not rate.allowed:
        logger.warning(
            "otp_rate_limited",
            extra={"destination": body.destination, "retry_after": rate.retry_after},
        )
        return JSONResponse(
            status_code=429,
            content={"error": "Too many OTP requests", "retryAfter": rate.retry_after},
        )

    otp, hash_ = generate_otp()
    await store_otp(r, body.channel, body.destination, hash_)

    provider = get_otp_provider()
    if body.channel == "sms":
        await provider.send_sms(body.destination, otp)
    else:
        await provider.send_email(body.destination, otp)

    logger.info(
        "otp_sent",
        extra={
            "channel": body.channel,
            "user_id": body.userId,
            "user_type": body.userType,
            "provider": settings.otp_provider,
        },
    )

    return {"message": "OTP sent", "expiresIn": settings.otp_expires_in_seconds}


@app.post("/otp/verify")
async def verify_otp(body: VerifyOTPBody):
    r = get_redis()
    result = await validate_otp(r, body.channel, body.destination, body.otp)

    await publish_event("auth.otp.verified", {
        "topic": "auth.otp.verified",
        "userId": body.userId,
        "channel": body.channel,
        "userType": body.userType,
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
    })

    if not result.valid:
        status = 429 if result.reason == "max_attempts" else 400
        logger.warning(
            "otp_verification_failed",
            extra={
                "reason": result.reason,
                "attempts_left": result.attempts_left,
                "user_id": body.userId,
                "channel": body.channel,
            },
        )
        return JSONResponse(
            status_code=status,
            content={
                "error": (
                    "Maximum attempts exceeded. Please request a new OTP."
                    if result.reason == "max_attempts"
                    else "Invalid or expired OTP"
                ),
                "attemptsLeft": result.attempts_left,
                "reason": result.reason,
            },
        )

    logger.info(
        "otp_verified",
        extra={"user_id": body.userId, "channel": body.channel, "user_type": body.userType},
    )

    return {"valid": True}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "otp-service", "provider": settings.otp_provider}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.otp_service_port, reload=True)
