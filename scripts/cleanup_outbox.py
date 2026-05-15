#!/usr/bin/env python3
"""
Archive and delete outbox events older than 7 days.
Run daily via cron: 0 2 * * * cd /app && python scripts/cleanup_outbox.py
"""

import asyncio
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://turtle:changeme@localhost:5432/turtle_corporate",
)


async def cleanup() -> None:
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("SELECT archive_old_outbox_events()"))

        stats = await conn.execute(text("""
            SELECT
                COUNT(*) FILTER (WHERE published = FALSE)  AS unpublished,
                COUNT(*) FILTER (WHERE published = TRUE)   AS published,
                (SELECT COUNT(*) FROM outbox_archive)      AS archived,
                (SELECT COUNT(*) FROM outbox_dlq)          AS dlq
            FROM outbox
        """))
        row = stats.fetchone()
        print(f"Outbox stats after cleanup:")
        print(f"  Unpublished : {row[0]}")
        print(f"  Published   : {row[1]}")
        print(f"  Archived    : {row[2]}")
        print(f"  DLQ         : {row[3]}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(cleanup())
