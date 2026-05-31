"""
summary_worker — consumes extraction.summarize events.

Calls CRM_AI_SERVICE_URL/summarize with the transcript and 174-field extraction,
then saves the returned summary + action items via procs.
"""

import httpx

from config import settings
from db.meeting_procs import (
    proc_get_extraction,
    proc_save_action_item,
    proc_save_summary,
)
from eventbus import publish_event, start_consumer
from logger import get_logger

logger = get_logger("meeting-service")


async def _handle_summarize(payload: dict) -> None:
    extraction_id = payload.get("extraction_id", "")
    meeting_id = payload.get("meeting_id", "")
    client_id = payload.get("client_id", "")
    transcript = payload.get("transcript", "")

    try:
        extraction = await proc_get_extraction(extraction_id)
    except ValueError as exc:
        logger.error("summary_worker_extraction_not_found", extra={"error": str(exc), "extraction_id": extraction_id})
        return

    # proc_get_extraction returns a dict (after migration 022). The fields
    # used to live in `raw_data`; now they're either `raw_data` (projected
    # for backward-compat by _fn_get_extraction) or the new `fields` array.
    # Tolerate both shapes here.
    if isinstance(extraction, dict):
        extraction_payload = (
            extraction.get("raw_data")
            or extraction.get("fields")
            or {}
        )
    else:
        # Old dataclass-style result (pre-022 path that no longer hits this branch
        # in production but harmless to keep)
        extraction_payload = getattr(extraction, "raw_data", None) or {}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                settings.crm_ai_service_url + "/summarize",
                json={
                    "transcript": transcript,
                    "meeting_id": meeting_id,
                    "client_id": client_id,
                    "extraction": extraction_payload,
                },
            )
            resp.raise_for_status()
            summary_data: dict = resp.json()
    except httpx.HTTPStatusError as exc:
        # 404 just means the agent service doesn't expose /summarize yet — skip quietly.
        if exc.response.status_code == 404:
            logger.info("ai_summarize_not_available", extra={"meeting_id": meeting_id})
        else:
            logger.error("ai_summarize_failed", extra={"error": str(exc), "meeting_id": meeting_id})
        return
    except httpx.HTTPError as exc:
        logger.error("ai_summarize_failed", extra={"error": str(exc), "meeting_id": meeting_id})
        return

    try:
        await proc_save_summary(
            meeting_id=meeting_id,
            client_id=client_id,
            executive_summary=summary_data.get("executive_summary", ""),
            key_points=summary_data.get("key_points", []),
            decisions_made=summary_data.get("decisions_made", []),
            client_sentiment=summary_data.get("client_sentiment"),
            advisor_notes=summary_data.get("advisor_notes"),
            model=summary_data.get("model", "crm-ai"),
            duration_seconds=summary_data.get("duration_seconds", 0.0),
        )
    except ValueError:
        logger.info("summary_already_exists", extra={"meeting_id": meeting_id})
        return
    except RuntimeError as exc:
        logger.error("save_summary_failed", extra={"error": str(exc), "meeting_id": meeting_id})
        return

    for i, item_text in enumerate(summary_data.get("action_items", [])[:10]):
        try:
            await proc_save_action_item(
                meeting_id=meeting_id,
                client_id=client_id,
                action_type=item_text.get("type", "follow_up") if isinstance(item_text, dict) else "follow_up",
                description=item_text.get("description", item_text) if isinstance(item_text, dict) else item_text,
                assigned_to=item_text.get("assigned_to") if isinstance(item_text, dict) else None,
                due_date=item_text.get("due_date") if isinstance(item_text, dict) else None,
                priority=item_text.get("priority", f"P{i}") if isinstance(item_text, dict) else f"P{i}",
                confidence=item_text.get("confidence", 0.8) if isinstance(item_text, dict) else 0.8,
            )
        except RuntimeError:
            pass

    await publish_event("meeting.summarized", {
        "meeting_id": meeting_id,
        "client_id": client_id,
        "extraction_id": extraction_id,
    })
    logger.info("summary_completed", extra={"meeting_id": meeting_id, "client_id": client_id})


async def run_summary_worker() -> None:
    """Supervises the extraction.summarize consumer. See transcript_processor.py
    for the full rationale — same cold-start race + silent task-death pattern."""
    import asyncio as _asyncio
    attempt = 0
    while True:
        attempt += 1
        try:
            await start_consumer(
                "extraction.summarize",
                "meeting-service-summary",
                _handle_summarize,
            )
            logger.warning("summary_worker_consumer_returned", extra={"attempt": attempt})
        except Exception as exc:
            backoff = min(30, 2 ** min(attempt, 5))
            logger.exception("summary_worker_consumer_failed", extra={
                "attempt": attempt,
                "next_retry_s": backoff,
                "error": str(exc),
            })
            await _asyncio.sleep(backoff)
