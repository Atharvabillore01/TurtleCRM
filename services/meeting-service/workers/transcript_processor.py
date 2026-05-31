"""
transcript_processor — consumes meeting.transcribed events.

Reads the transcript + meeting context straight from the event payload (no DB
row lookup), POSTs to the AI extraction agent at CRM_AI_SERVICE_URL/extract,
saves the extraction, and emits the downstream events.
"""

import asyncio
import time
import uuid
from datetime import datetime, timezone

import httpx

from config import settings
from db.meeting_procs import proc_save_extraction
from eventbus import publish_event, start_consumer
from logger import get_logger
from metrics import extractions_completed_total

logger = get_logger("meeting-service")


async def _handle_transcribed(payload: dict) -> None:
    firefly_meeting_id = payload.get("firefly_meeting_id", "")
    meeting_id         = payload.get("meeting_id", "")
    client_id          = payload.get("client_id", "")
    agenda             = payload.get("agenda", "")
    agents_to_use      = payload.get("agents_to_use", [])
    transcript_text    = payload.get("transcript_text", "")

    logger.info("transcript_processor_received", extra={
        "firefly_meeting_id": firefly_meeting_id,
        "meeting_id": meeting_id,
        "agents_to_use": agents_to_use,
        "transcript_chars": len(transcript_text),
    })

    if not transcript_text:
        logger.warning("transcript_processor_no_transcript", extra={"meeting_id": meeting_id})
        return
    if not meeting_id:
        logger.warning("transcript_processor_no_meeting_id", extra={"firefly_meeting_id": firefly_meeting_id})
        return

    start = time.perf_counter()

    # Retry the CRM-AI extraction up to 4 attempts. 504/timeout/5xx are
    # transient (LLM cold-starts, nginx proxy timeouts upstream of the
    # agent); 4xx is a real client error and short-circuits.
    payload = {
        "transcript": transcript_text,
        "meeting_id": meeting_id,
        "context": {
            "client_id":     client_id,
            "agenda":        agenda,
            "agents_to_use": agents_to_use,
        },
    }
    extract_url = settings.crm_ai_service_url + "/extract"
    extraction_data: dict | None = None
    last_error: str | None = None

    for attempt in range(1, 5):
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                resp = await client.post(extract_url, json=payload)
                # 4xx → don't retry, the request shape is wrong
                if 400 <= resp.status_code < 500:
                    logger.error("ai_extraction_client_error", extra={
                        "status": resp.status_code,
                        "body":   resp.text[:500],
                        "meeting_id": meeting_id,
                    })
                    return
                resp.raise_for_status()
                extraction_data = resp.json()
                break
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            last_error = str(exc)
            backoff = (2 ** (attempt - 1)) * 10   # 10s, 20s, 40s, 80s
            logger.warning("ai_extraction_retry", extra={
                "attempt":    attempt,
                "of":         4,
                "error":      last_error,
                "next_in_s":  backoff if attempt < 4 else None,
                "meeting_id": meeting_id,
            })
            if attempt < 4:
                await asyncio.sleep(backoff)

    if extraction_data is None:
        logger.error("ai_extraction_failed", extra={
            "error":     last_error,
            "attempts":  4,
            "meeting_id": meeting_id,
        })
        return

    duration = time.perf_counter() - start
    job_id = str(uuid.uuid4())

    try:
        extraction_id = await proc_save_extraction(
            client_id=client_id,
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
        logger.error("save_extraction_failed", extra={
            "error": str(exc), "meeting_id": meeting_id,
        })
        return

    extractions_completed_total.inc()
    logger.info("extraction_completed", extra={
        "extraction_id": extraction_id,
        "meeting_id": meeting_id,
        "duration_seconds": round(duration, 3),
    })

    # Local JSON dump removed — sp_save_extraction stores the full raw_data
    # JSONB on the extractions row; that is the authoritative copy.

    await publish_event("extraction.completed", {
        "extraction_id": extraction_id,
        "meeting_id": meeting_id,
        "client_id": client_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    await publish_event("extraction.summarize", {
        "extraction_id": extraction_id,
        "meeting_id": meeting_id,
        "client_id": client_id,
        "transcript": transcript_text,
    })
    await publish_event("extraction.save", {
        "extraction_id": extraction_id,
        "meeting_id": meeting_id,
        "client_id": client_id,
    })


async def run_transcript_processor() -> None:
    await start_consumer("meeting.transcribed", "meeting-service-transcript", _handle_transcribed)
