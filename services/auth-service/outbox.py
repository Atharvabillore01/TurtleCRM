"""
Transactional outbox helper.

Routes call `write_outbox_event()` inside a database transaction so that
event publication is atomic with any state changes. The outbox_publisher
worker polls and delivers to RabbitMQ.
"""

import json
import os
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://turtle:changeme@localhost:5432/turtle_corporate",
)

_engine = None
_AsyncSessionLocal = None


def _get_session_factory():
    global _engine, _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        _engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
        _AsyncSessionLocal = sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    return _AsyncSessionLocal


async def write_outbox_event(
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict,
    metadata: dict | None = None,
) -> str:
    """Insert one event row into outbox; returns the new event UUID."""
    factory = _get_session_factory()
    async with factory() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, metadata)
                    VALUES (:aggregate_type, :aggregate_id, :event_type, :payload::jsonb, :metadata::jsonb)
                    RETURNING id
                """),
                {
                    "aggregate_type": aggregate_type,
                    "aggregate_id": aggregate_id,
                    "event_type": event_type,
                    "payload": json.dumps(payload),
                    "metadata": json.dumps(metadata) if metadata else "null",
                },
            )
            return str(result.scalar_one())
