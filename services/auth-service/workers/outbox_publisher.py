#!/usr/bin/env python3
"""
Outbox Publisher Worker

Polls the outbox table every 100ms and publishes unpublished events to RabbitMQ.
Moves failed events (>= 10 attempts) to outbox_dlq.
"""

import asyncio
import json
import os
import signal
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from eventbus import publish_event, _get_pub_exchange

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://turtle:changeme@localhost:5432/turtle_corporate",
)
engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

MAX_ATTEMPTS = 10
POLL_INTERVAL = 0.1  # 100ms
BATCH_SIZE = 100

_running = True


async def _poll_and_publish() -> None:
    while _running:
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    text("""
                        SELECT id, event_type, payload, publish_attempts
                        FROM outbox
                        WHERE published = FALSE AND publish_attempts < :max_attempts
                        ORDER BY sequence_number
                        LIMIT :limit
                        FOR UPDATE SKIP LOCKED
                    """),
                    {"max_attempts": MAX_ATTEMPTS, "limit": BATCH_SIZE},
                )
                rows = result.fetchall()

                if not rows:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                for row in rows:
                    event_id, event_type, payload, attempts = row
                    try:
                        await publish_event(event_type, payload)
                        await session.execute(
                            text("""
                                UPDATE outbox
                                SET published = TRUE,
                                    published_at = :now,
                                    publish_attempts = publish_attempts + 1,
                                    last_attempt_at = :now
                                WHERE id = :id
                            """),
                            {"now": datetime.now(timezone.utc), "id": event_id},
                        )
                        print(f"[outbox] published {event_type} ({event_id})")

                    except Exception as e:
                        new_attempts = attempts + 1
                        params = {
                            "now": datetime.now(timezone.utc),
                            "error": str(e),
                            "id": event_id,
                        }

                        if new_attempts >= MAX_ATTEMPTS:
                            await session.execute(
                                text("""
                                    INSERT INTO outbox_dlq (id, original_event_type, payload, error, retry_count)
                                    VALUES (:id, :event_type, :payload::jsonb, :error, :attempts)
                                    ON CONFLICT DO NOTHING
                                """),
                                {
                                    "id": event_id,
                                    "event_type": event_type,
                                    "payload": json.dumps(payload),
                                    "error": str(e),
                                    "attempts": new_attempts,
                                },
                            )
                            await session.execute(
                                text("DELETE FROM outbox WHERE id = :id"),
                                {"id": event_id},
                            )
                            print(f"[outbox] moved to DLQ {event_type} ({event_id}) after {new_attempts} attempts")
                        else:
                            await session.execute(
                                text("""
                                    UPDATE outbox
                                    SET publish_attempts = :attempts,
                                        last_attempt_at = :now,
                                        last_error = :error
                                    WHERE id = :id
                                """),
                                {**params, "attempts": new_attempts},
                            )
                            print(f"[outbox] publish failed attempt {new_attempts}/{MAX_ATTEMPTS}: {e}")

                await session.commit()

        except Exception as e:
            print(f"[outbox] polling loop error: {e}")
            await asyncio.sleep(1)


def _stop(sig, frame) -> None:
    global _running
    print("[outbox] shutdown signal received")
    _running = False


async def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    # Warm up publisher connection
    await _get_pub_exchange()

    print(f"[outbox] publisher started (poll={POLL_INTERVAL}s, batch={BATCH_SIZE})")
    await _poll_and_publish()
    print("[outbox] publisher stopped")


if __name__ == "__main__":
    asyncio.run(main())
