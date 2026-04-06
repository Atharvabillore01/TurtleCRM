from redis_client import get_redis
from otp.generate import generate_otp
from otp.store import store_otp
from otp.rate_limit import check_rate_limit
from providers.factory import get_otp_provider
from eventbus import publish_event
from logger import get_logger

logger = get_logger("otp-service")


async def handle_otp_requested(payload: dict) -> None:
    channel = payload.get("channel", "sms")
    target = payload.get("target", "")
    user_id = payload.get("userId", "")
    user_type = payload.get("userType", "client")

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
    try:
        if channel == "sms":
            await provider.send_sms(target, otp)
        else:
            await provider.send_email(target, otp)
        logger.info(
            "otp_dispatched",
            extra={"channel": channel, "user_id": user_id, "user_type": user_type},
        )
    except Exception as e:
        logger.error(
            "otp_dispatch_failed",
            extra={"channel": channel, "user_id": user_id, "error": str(e)},
            exc_info=True,
        )
