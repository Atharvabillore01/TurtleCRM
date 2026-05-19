"""
Outbox proc stubs — registered into the shared proc_caller at startup.

When the backend team delivers a real proc, replace only the handler body.
Handlers must return ProcResult; the public wrappers unpack .result for callers.
"""

import uuid
import logging
from dataclasses import dataclass
from typing import Optional

from db.proc_caller import register_proc, call_proc, ProcResult

logger = logging.getLogger(__name__)


# ── Domain model ──────────────────────────────────────────────────────────────

@dataclass
class OutboxRow:
    id: str
    event_type: str
    payload: dict
    publish_attempts: int


# ── Proc handlers ─────────────────────────────────────────────────────────────

async def _sp_write_outbox_event(
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict,
    metadata: Optional[dict],
) -> ProcResult:
    event_id = str(uuid.uuid4())
    logger.info("[db] sp_write_outbox_event", extra={"event_id": event_id, "event_type": event_type})
    return ProcResult(result=event_id)


async def _sp_poll_unpublished_events(batch_size: int) -> ProcResult:
    logger.debug("[db] sp_poll_unpublished_events → []")
    return ProcResult(result=[])


async def _sp_mark_event_published(event_id: str) -> ProcResult:
    logger.info("[db] sp_mark_event_published", extra={"event_id": event_id})
    return ProcResult()


async def _sp_mark_event_failed(event_id: str, error: str, new_attempt_count: int) -> ProcResult:
    logger.warning("[db] sp_mark_event_failed", extra={"event_id": event_id, "attempt": new_attempt_count})
    return ProcResult()


async def _sp_move_to_dlq(
    event_id: str,
    event_type: str,
    payload: dict,
    error: str,
    retry_count: int,
) -> ProcResult:
    logger.error("[db] sp_move_to_dlq", extra={"event_id": event_id, "event_type": event_type})
    return ProcResult()


# ── Registration ──────────────────────────────────────────────────────────────

def register_outbox_mocks() -> None:
    """Call once at service startup (inside lifespan)."""
    register_proc("sp_write_outbox_event",       _sp_write_outbox_event)
    register_proc("sp_poll_unpublished_events",   _sp_poll_unpublished_events)
    register_proc("sp_mark_event_published",      _sp_mark_event_published)
    register_proc("sp_mark_event_failed",         _sp_mark_event_failed)
    register_proc("sp_move_to_dlq",               _sp_move_to_dlq)


# ── Public proc calls ─────────────────────────────────────────────────────────

async def proc_write_outbox_event(
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict,
    metadata: Optional[dict] = None,
) -> str:
    res = await call_proc("sp_write_outbox_event", aggregate_type, aggregate_id, event_type, payload, metadata)
    if not res.ok:
        raise RuntimeError(f"sp_write_outbox_event failed [{res.errornumber}]: {res.errormessage}")
    return res.result  # str event_id


async def proc_poll_unpublished_events(batch_size: int = 100) -> list[OutboxRow]:
    res = await call_proc("sp_poll_unpublished_events", batch_size)
    if not res.ok:
        raise RuntimeError(f"sp_poll_unpublished_events failed [{res.errornumber}]: {res.errormessage}")
    return res.result  # list[OutboxRow]


async def proc_mark_event_published(event_id: str) -> None:
    res = await call_proc("sp_mark_event_published", event_id)
    if not res.ok:
        logger.error("sp_mark_event_published failed", extra={"event_id": event_id, "err": res.errormessage})


async def proc_mark_event_failed(event_id: str, error: str, new_attempt_count: int) -> None:
    res = await call_proc("sp_mark_event_failed", event_id, error, new_attempt_count)
    if not res.ok:
        logger.error("sp_mark_event_failed failed", extra={"event_id": event_id, "err": res.errormessage})


async def proc_move_to_dlq(
    event_id: str,
    event_type: str,
    payload: dict,
    error: str,
    retry_count: int,
) -> None:
    res = await call_proc("sp_move_to_dlq", event_id, event_type, payload, error, retry_count)
    if not res.ok:
        logger.error("sp_move_to_dlq failed", extra={"event_id": event_id, "err": res.errormessage})
