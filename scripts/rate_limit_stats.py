#!/usr/bin/env python3
"""Show current rate limit counters from Redis."""

import os
import redis

def show_rate_limits() -> None:
    r = redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        password=os.getenv("REDIS_PASSWORD"),
        decode_responses=True,
    )

    keys = r.keys("rl:*")
    if not keys:
        print("No active rate limits.")
        return

    print(f"{'Key':<60} {'Count':>6}  {'TTL':>6}")
    print("-" * 76)
    for key in sorted(keys):
        count = r.get(key) or "?"
        ttl = r.ttl(key)
        print(f"{key:<60} {count:>6}  {ttl:>5}s")

if __name__ == "__main__":
    show_rate_limits()
