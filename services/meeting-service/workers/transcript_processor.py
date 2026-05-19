"""
transcript_processor — consumes meeting.transcribed events.

Flow:
  1. Load meeting context (fn_get_meeting_for_extraction)
  2. POST transcript + context to AI extraction agent (CRM_AI_SERVICE_URL/extract)
  3. Save extraction (sp_save_extraction)
  4. Publish extraction.completed → triggers summary_worker + data_persistence
"""

import time
import uuid
from datetime import datetime, timezone

import httpx

from config import settings
from db.meeting_procs import proc_get_meeting_for_extraction, proc_save_extraction
from eventbus import publish_event, start_consumer
from logger import get_logger
from metrics import extractions_completed_total

logger = get_logger("meeting-service")


async def _handle_transcribed(payload: dict) -> None:
    firefly_meeting_id = payload.get("firefly_meeting_id", "")
    logger.info("transcript_processor_received", extra={"firefly_meeting_id": firefly_meeting_id})

    from db.meeting_procs import _meetings
    meeting = next((m for m in _meetings.values() if m.firefly_meeting_id == firefly_meeting_id), None)
    if not meeting:
        logger.error("transcript_processor_meeting_not_found", extra={"firefly_meeting_id": firefly_meeting_id})
        return

    meeting_id = meeting.id

    try:
        context = await proc_get_meeting_for_extraction(meeting_id)
    except RuntimeError as exc:
        logger.error("get_meeting_context_failed", extra={"error": str(exc), "meeting_id": meeting_id})
        return

    start = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                settings.crm_ai_service_url + "/extract",
                json={
                    "transcript": meeting.transcript_text or "",
                    "meeting_id": meeting_id,
                    "context": {
                        "client_id": meeting.client_id,
                        "agenda": meeting.agenda,
                        "agents_to_use": context.get("agents_to_use", []),
                        "scheduled_at": meeting.scheduled_at,
                    },
                },
            )
            resp.raise_for_status()
            extraction_data: dict = resp.json()
    except httpx.HTTPError as exc:
        logger.error("ai_extraction_failed", extra={"error": str(exc), "meeting_id": meeting_id})
        return

    duration = time.perf_counter() - start
    job_id = str(uuid.uuid4())

    try:
        extraction_id = await proc_save_extraction(
            client_id=meeting.client_id,
            meeting_id=meeting_id,
            extraction_job_id=job_id,
            provider="crm-ai",
            model=extraction_data.get("model", "unknown"),
            extracted_at=datetime.now(timezone.utc).isoformat(),
            duration_seconds=round(duration, 3),
            total_fields=len(extraction_data.get("fields", extraction_data)),
            raw_data=extraction_data.get("fields", extraction_data),
        )
    except (ValueError, RuntimeError) as exc:
        logger.error("save_extraction_failed", extra={"error": str(exc), "meeting_id": meeting_id})
        return

    extractions_completed_total.inc()
    logger.info("extraction_completed", extra={"extraction_id": extraction_id, "meeting_id": meeting_id})

    await publish_event("extraction.completed", {
        "extraction_id": extraction_id,
        "meeting_id": meeting_id,
        "client_id": meeting.client_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    await publish_event("extraction.summarize", {
        "extraction_id": extraction_id,
        "meeting_id": meeting_id,
        "client_id": meeting.client_id,
        "transcript": meeting.transcript_text or "",
    })
    await publish_event("extraction.save", {
        "extraction_id": extraction_id,
        "meeting_id": meeting_id,
        "client_id": meeting.client_id,
    })


async def run_transcript_processor() -> None:
    await start_consumer("meeting.transcribed", "meeting-service-transcript", _handle_transcribed)
