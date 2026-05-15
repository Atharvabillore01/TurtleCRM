from datetime import datetime, timezone

from pydantic import ValidationError

from redis_client import get_redis
from otp.generate import generate_otp
from otp.store import store_otp
from otp.rate_limit import check_rate_limit
from providers.factory import get_otp_provider, get_circuit_breaker
from eventbus import publish_event
from schemas.events import OTPRequestedEvent
from config import settings
from logger import get_logger

logger = get_logger("otp-service")


async def handle_otp_requested(payload: dict) -> None:
    # Validate incoming event schema — schema violations are permanent errors
    try:
        event = OTPRequestedEvent(**payload)
    except ValidationError as exc:
        logger.error("otp_event_schema_invalid", extra={"errors": exc.errors(), "payload": payload})
        raise  # let DLQ retry logic handle it (max retries → DLQ)

    channel = event.channel.value
    target = event.target
    user_id = event.userId
    user_type = event.userType.value
    requested_at = event.requestedAt.isoformat()

    # Drop stale messages — if the request is older than OTP TTL, the user
    # already moved on or the session expired; sending now would confuse them
    if requested_at:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(requested_at if isinstance(requested_at, str) else requested_at.isoformat())).total_seconds()
        if age > settings.otp_expires_in_seconds:
            logger.warning(
                "otp_event_stale_dropped",
                extra={"age_seconds": int(age), "user_id": user_id},
            )
            return

    logger.debug(
        "otp_event_received",
        extra={"channel": channel, "user_id": user_id, "user_type": user_type},
    )

    r = get_redis()

    rate = await check_rate_limit(r, target)
    if not rate.allowed:
        logger.warning(
            "otp_rate_limited",
            extra={"user_id": user_id, "retry_after": rate.retry_after},
        )
        return

    otp, hash_ = generate_otp()
    await store_otp(r, channel, target, hash_)

    provider = get_otp_provider()
    circuit = get_circuit_breaker()
    try:
        if channel == "sms":
            await circuit.call(provider.send_sms, target, otp)
        else:
            await circuit.call(provider.send_email, target, otp)
        logger.info(
            "otp_dispatched",
            extra={"channel": channel, "user_id": user_id, "user_type": user_type, "circuit": circuit.state.value},
        )
    except RuntimeError as e:
        # Circuit is OPEN — don't retry, log and drop
        logger.error("otp_circuit_open", extra={"channel": channel, "user_id": user_id, "error": str(e)})
    except Exception as e:
        logger.error(
            "otp_dispatch_failed",
            extra={"channel": channel, "user_id": user_id, "error": str(e), "circuit": circuit.state.value},
            exc_info=True,
        )
        raise  # let DLQ retry logic handle it
