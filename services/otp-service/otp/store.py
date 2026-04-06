import json
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from config import settings


def otp_key(channel: str, destination: str) -> str:
    return f"otp:{channel}:{destination}"


async def store_otp(r: aioredis.Redis, channel: str, destination: str, hash_: str) -> None:
    ttl = settings.otp_expires_in_seconds
    record = {
        "hash": hash_,
        "attempts": 0,
        "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat(),
    }
    await r.setex(otp_key(channel, destination), ttl, json.dumps(record))


async def get_stored_otp(r: aioredis.Redis, channel: str, destination: str) -> dict | None:
    raw = await r.get(otp_key(channel, destination))
    if not raw:
        return None
    return json.loads(raw)


async def update_stored_otp(r: aioredis.Redis, channel: str, destination: str, record: dict) -> None:
    ttl = await r.ttl(otp_key(channel, destination))
    if ttl > 0:
        await r.setex(otp_key(channel, destination), ttl, json.dumps(record))


async def delete_stored_otp(r: aioredis.Redis, channel: str, destination: str) -> None:
    await r.delete(otp_key(channel, destination))
