from dataclasses import dataclass

import redis.asyncio as aioredis
from passlib.context import CryptContext

from otp.store import get_stored_otp, update_stored_otp, delete_stored_otp

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
MAX_ATTEMPTS = 3


@dataclass
class ValidateResult:
    valid: bool
    attempts_left: int
    reason: str | None = None  # "invalid_otp" | "max_attempts" | "not_found"


async def validate_otp(r: aioredis.Redis, channel: str, destination: str, otp: str) -> ValidateResult:
    from providers.factory import get_otp_provider

    provider = get_otp_provider()

    # Twilio Verify owns the code — delegate to their API, skip Redis
    if hasattr(provider, "verify_code"):
        approved = await provider.verify_code(destination, otp)
        if approved:
            return ValidateResult(valid=True, attempts_left=0)
        return ValidateResult(valid=False, attempts_left=0, reason="invalid_otp")

    # Default: bcrypt check against Redis-stored hash
    record = await get_stored_otp(r, channel, destination)

    if not record:
        return ValidateResult(valid=False, attempts_left=0, reason="not_found")

    match = pwd_ctx.verify(otp, record["hash"])

    if match:
        await delete_stored_otp(r, channel, destination)
        return ValidateResult(valid=True, attempts_left=0)

    record["attempts"] += 1

    if record["attempts"] >= MAX_ATTEMPTS:
        await delete_stored_otp(r, channel, destination)
        return ValidateResult(valid=False, attempts_left=0, reason="max_attempts")

    await update_stored_otp(r, channel, destination, record)
    return ValidateResult(
        valid=False,
        attempts_left=MAX_ATTEMPTS - record["attempts"],
        reason="invalid_otp",
    )
