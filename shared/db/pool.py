"""
Process-level asyncpg connection pool.

One pool per service process. init_pool() is called in the FastAPI lifespan
startup; close_pool() in shutdown. Any module that needs DB access calls
get_pool() — no import-time side effects.

The DSN comes from `DATABASE_URL` (settings) — same env var as the rest
of the stack.
""" 

from __future__ import annotations

import logging
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def init_pool(dsn: str, *, min_size: int = 1, max_size: int = 10) -> asyncpg.Pool:
    """Create the process-level pool. Idempotent."""
    global _pool
    if _pool is not None:
        return _pool
    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=min_size,
        max_size=max_size,
        command_timeout=30,
    )
    logger.info("db_pool_initialised", extra={"min": min_size, "max": max_size})
    return _pool


async def close_pool() -> None:
    """Tear the pool down on service shutdown."""
    global _pool
    if _pool is None:
        return
    await _pool.close()
    _pool = None
    logger.info("db_pool_closed")


def get_pool() -> asyncpg.Pool:
    """Return the active pool — raises if not initialised."""
    if _pool is None:
        raise RuntimeError(
            "db pool not initialised — call init_pool(dsn) from your service's lifespan startup"
        )
    return _pool
