#!/usr/bin/env python3
"""Interactive DLQ processing tool: republish, discard, or skip messages."""

import asyncio
import json
import os
import sys
from datetime import datetime

import aio_pika


async def process_dlq(queue_name: str) -> None:
    connection = await aio_pika.connect_robust(
        os.getenv("RABBITMQ_URL", "amqp://turtle:changeme@localhost:5672/")
    )

    async with connection:
        channel = await connection.channel()

        try:
            queue = await channel.declare_queue(queue_name, passive=True)
        except Exception as e:
            print(f"Queue not found: {e}")
            return

        count = queue.declaration_result.message_count
        print(f"Queue: {queue_name}  Messages: {count}")
        if count == 0:
            print("Nothing to process.")
            return

        exchange = await channel.declare_exchange(
            "turtle.events", aio_pika.ExchangeType.TOPIC, durable=True
        )

        processed = 0
        async with queue.iterator() as q_iter:
            async for message in q_iter:
                async with message.process(ignore_processed=True):
                    retry = (message.headers or {}).get("x-retry-count", "?")
                    body_str = message.body.decode(errors="replace")

                    print("\n" + "=" * 70)
                    print(f"Message ID   : {message.message_id}")
                    print(f"Retry count  : {retry}")
                    try:
                        print(f"Payload      : {json.dumps(json.loads(body_str), indent=2)}")
                    except Exception:
                        print(f"Body (raw)   : {body_str}")
                    print()

                    action = input("[r]epublish  [d]iscard  [s]kip  [q]uit: ").strip().lower()

                    if action == "r":
                        original_topic = input("Routing key (e.g. auth.otp.requested): ").strip()
                        await exchange.publish(
                            aio_pika.Message(
                                body=message.body,
                                headers={"x-manual-republish": True},
                                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                            ),
                            routing_key=original_topic,
                        )
                        await message.ack()
                        print(f"Republished to {original_topic}")
                        processed += 1

                    elif action == "d":
                        await message.ack()
                        print("Discarded.")
                        processed += 1

                    elif action == "s":
                        await message.nack(requeue=True)
                        print("Skipped (stays in DLQ).")

                    elif action == "q":
                        await message.nack(requeue=True)
                        break

                    else:
                        print("Unknown action — skipping.")
                        await message.nack(requeue=True)

                    if action not in ("q", "s") and input("Continue? [y/n]: ").strip().lower() != "y":
                        break

        print(f"\nDone. Processed {processed} message(s).")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/process_dlq.py <queue_name>")
        sys.exit(1)
    asyncio.run(process_dlq(sys.argv[1]))
