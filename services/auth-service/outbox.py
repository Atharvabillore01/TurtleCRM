"""
Outbox helper used by route handlers.

Calls proc stubs in db/outbox_procs.py.
No direct DB connection here — swap the proc stubs when real procs arrive.

While proc stubs are in use (no real outbox poller), we also publish directly
to RabbitMQ so the event reaches downstream consumers immediately.
Remove the direct publish once a real outbox publisher is wired up.
"""

from db.outbox_procs import proc_write_outbox_event
from eventbus import publish_event


async def write_outbox_event(
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict,
    metadata: dict | None = None,
) -> str:
    """Write one event to the outbox and publish it directly (stub mode). Returns the new event ID."""
    event_id = await proc_write_outbox_event(
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event_type,
        payload=payload,
        metadata=metadata,
    )
    # Direct publish bypasses the outbox poller — remove when real poller is running
    await publish_event(event_type, payload)
    return event_id
