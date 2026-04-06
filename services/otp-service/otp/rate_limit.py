from dataclasses import dataclass

import redis.asyncio as aioredis

MAX_REQUESTS = 3
WINDOW_SECS = 15 * 60  # 15 minutes


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after: int = 0


async def check_rate_limit(r: aioredis.Redis, destination: str) -> RateLimitResult:
    key = f"otprate:{destination}"
    current = await r.incr(key)

    if current == 1:
        await r.expire(key, WINDOW_SECS)

    if current > MAX_REQUESTS:
        ttl = await r.ttl(key)
        return RateLimitResult(allowed=False, retry_after=ttl)

    return RateLimitResult(allowed=True)
