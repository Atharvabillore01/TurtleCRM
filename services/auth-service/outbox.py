"""
Outbox helper used by route handlers.

Calls proc stubs in db/outbox_procs.py.
No direct DB connection here — swap the proc stubs when real procs arrive.
"""

from db.outbox_procs import proc_write_outbox_event


async def write_outbox_event(
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict,
    metadata: dict | None = None,
) -> str:
    """Write one event to the outbox. Returns the new event ID."""
    return await proc_write_outbox_event(
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event_type,
        payload=payload,
        metadata=metadata,
    )
