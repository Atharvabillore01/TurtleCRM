import logging

from redis_client import get_redis
from otp.generate import generate_otp
from otp.store import store_otp
from otp.rate_limit import check_rate_limit
from providers.factory import get_otp_provider
from eventbus import publish_event

logger = logging.getLogger(__name__)


async def handle_otp_requested(payload: dict) -> None:
    channel = payload.get("channel", "sms")
    target = payload.get("target", "")
    user_id = payload.get("userId", "")
    user_type = payload.get("userType", "client")

    r = get_redis()

    rate = await check_rate_limit(r, target)
    if not rate.allowed:
        logger.warning(f"[otp-consumer] rate limit hit for {target}, retry in {rate.retry_after}s")
        return

    otp, hash_ = generate_otp()
    await store_otp(r, channel, target, hash_)

    provider = get_otp_provider()
    try:
        if channel == "sms":
            await provider.send_sms(target, otp)
        else:
            await provider.send_email(target, otp)
        logger.info(f"[otp-consumer] OTP dispatched via {channel} to {target}")
    except Exception as e:
        logger.error(f"[otp-consumer] provider error ({channel} → {target}): {e}")
