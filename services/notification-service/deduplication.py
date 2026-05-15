"""
Message deduplication using Redis SET NX.

Records a processed message ID for 1 hour. If the same ID arrives again
within that window the message is skipped rather than handled twice.
"""

import hashlib
import json

from redis.asyncio import Redis

TTL_SECONDS = 3600  # 1 hour


def _make_key(message_id: str) -> str:
    return f"dedup:{message_id}"


async def is_duplicate(redis: Redis, message_id: str) -> bool:
    """Return True if this message has already been processed."""
    key = _make_key(message_id)
    was_set = await redis.set(key, "1", ex=TTL_SECONDS, nx=True)
    return was_set is None  # None means key already existed → duplicate


def derive_message_id(payload: dict, topic: str) -> str:
    """Derive a stable ID when the message has no explicit dedup key."""
    stable = json.dumps({"topic": topic, **payload}, sort_keys=True)
    return hashlib.sha256(stable.encode()).hexdigest()
