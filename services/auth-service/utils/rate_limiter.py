from dataclasses import dataclass
from typing import Optional

import redis.asyncio as aioredis


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after: int = 0


class RateLimiter:
    def __init__(self, redis_client: aioredis.Redis):
        self.redis = redis_client

    async def check(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
        identifier: Optional[str] = None,
    ) -> RateLimitResult:
        full_key = f"rl:{key}:{identifier}" if identifier else f"rl:{key}"
        current = await self.redis.get(full_key)

        if current is None:
            await self.redis.setex(full_key, window_seconds, 1)
            return RateLimitResult(allowed=True)

        if int(current) >= max_requests:
            ttl = await self.redis.ttl(full_key)
            return RateLimitResult(allowed=False, retry_after=max(ttl, 0))

        await self.redis.incr(full_key)
        return RateLimitResult(allowed=True)
