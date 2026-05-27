"""
Outbox Publisher Worker

Polls for unpublished outbox events and delivers them to RabbitMQ.
All DB interaction goes through db/outbox_procs.py stubs —
no direct DB calls here.
"""

import asyncio
import signal

from db.outbox_procs import (
    proc_poll_unpublished_events,
    proc_mark_event_published,
    proc_mark_event_failed,
    proc_move_to_dlq,
)
from eventbus import publish_event, _get_exchange

MAX_ATTEMPTS  = 10
POLL_INTERVAL = 0.1   # seconds between polls when queue is empty

_running = True


async def _poll_and_publish() -> None:
    while _running:
        try:
            events = await proc_poll_unpublished_events(batch_size=100)

            if not events:
                await asyncio.sleep(POLL_INTERVAL)
                continue

            for event in events:
                try:
                    await publish_event(event.event_type, event.payload)
                    await proc_mark_event_published(event.id)
                    print(f"[outbox] published {event.event_type} ({event.id})")

                except Exception as exc:
                    new_attempts = event.publish_attempts + 1

                    if new_attempts >= MAX_ATTEMPTS:
                        await proc_move_to_dlq(
                            event_id=event.id,
                            event_type=event.event_type,
                            payload=event.payload,
                            error=str(exc),
                            retry_count=new_attempts,
                        )
                    else:
                        await proc_mark_event_failed(
                            event_id=event.id,
                            error=str(exc),
                            new_attempt_count=new_attempts,
                        )

        except Exception as exc:
            print(f"[outbox] polling loop error: {exc}")
            await asyncio.sleep(1)


def _stop(sig, frame) -> None:
    global _running
    print("[outbox] shutdown signal received")
    _running = False


async def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    await _get_exchange()   # warm up RabbitMQ connection
    print(f"[outbox] publisher started (poll={POLL_INTERVAL}s)")
    await _poll_and_publish()
    print("[outbox] publisher stopped")


if __name__ == "__main__":
    asyncio.run(main())
