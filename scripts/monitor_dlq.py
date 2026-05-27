#!/usr/bin/env python3
"""Monitor Dead Letter Queues and alert on messages."""

import asyncio
import os

import aio_pika


DLQS = [
    "otp-service-group.auth.otp.requested.dlq",
    "notification-service-group.auth.login.success.dlq",
    "notification-service-group.auth.login.failed.dlq",
]


async def check_dlqs() -> None:
    connection = await aio_pika.connect_robust(
        os.getenv("RABBITMQ_URL", "amqp://turtle:changeme@localhost:5672/")
    )

    async with connection:
        channel = await connection.channel()

        for dlq_name in DLQS:
            try:
                queue = await channel.declare_queue(dlq_name, passive=True)
                count = queue.declaration_result.message_count

                if count > 0:
                    print(f"ALERT: {dlq_name} has {count} messages")
                    print(f"  Run: python scripts/process_dlq.py {dlq_name}")
                else:
                    print(f"OK: {dlq_name} (0 messages)")

            except Exception as e:
                print(f"ERROR: {dlq_name} — {e}")


if __name__ == "__main__":
    asyncio.run(check_dlqs())
