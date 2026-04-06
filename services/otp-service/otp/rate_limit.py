from dataclasses import dataclass

import redis.asyncio as aioredis
from config import settings

MAX_REQUESTS = 3
WINDOW_SECS = 15 * 60  # 15 minutes


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after: int = 0


async def check_rate_limit(r: aioredis.Redis, destination: str) -> RateLimitResult:
    key = f"otprate:{destination}"
    max_requests = max(1, settings.otp_rate_limit_max_requests)
    window_secs = max(1, settings.otp_rate_limit_window_secs)
    current = await r.incr(key)

    if current == 1:
        await r.expire(key, window_secs)

    if current > max_requests:
        ttl = await r.ttl(key)
        return RateLimitResult(allowed=False, retry_after=ttl)

    return RateLimitResult(allowed=True)
