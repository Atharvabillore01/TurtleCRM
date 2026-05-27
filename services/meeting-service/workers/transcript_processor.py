"""
transcript_processor — consumes meeting.transcribed events.

Reads the transcript + meeting context straight from the event payload (no DB
row lookup), POSTs to the AI extraction agent at CRM_AI_SERVICE_URL/extract,
saves the extraction, and emits the downstream events.
"""

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config import settings
from db.meeting_procs import proc_save_extraction
from eventbus import publish_event, start_consumer
from logger import get_logger
from metrics import extractions_completed_total

EXTRACTIONS_DIR = Path(os.environ.get("TRANSCRIPTS_DIR", "/app/transcripts")) / "extractions"


def _save_extraction_to_file(extraction_id: str, meeting_id: str,
                             firefly_meeting_id: str, payload: dict) -> Path:
    EXTRACTIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = EXTRACTIONS_DIR / f"{meeting_id}_{extraction_id}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path

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

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                settings.crm_ai_service_url + "/extract",
                json={
                    "transcript": transcript_text,
                    "meeting_id": meeting_id,
                    "context": {
                        "client_id":     client_id,
                        "agenda":        agenda,
                        "agents_to_use": agents_to_use,
                    },
                },
            )
            resp.raise_for_status()
            extraction_data: dict = resp.json()
    except httpx.HTTPError as exc:
        logger.error("ai_extraction_failed", extra={
            "error": str(exc), "meeting_id": meeting_id,
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

    try:
        saved_path = _save_extraction_to_file(
            extraction_id=extraction_id,
            meeting_id=meeting_id,
            firefly_meeting_id=firefly_meeting_id,
            payload={
                "extraction_id":      extraction_id,
                "meeting_id":         meeting_id,
                "firefly_meeting_id": firefly_meeting_id,
                "client_id":          client_id,
                "agenda":             agenda,
                "agents_to_use":      agents_to_use,
                "model":              extraction_data.get("model", "unknown"),
                "duration_seconds":   round(duration, 3),
                "extracted_at":       datetime.now(timezone.utc).isoformat(),
                "fields":             extraction_data.get("fields", extraction_data),
            },
        )
        logger.info("extraction_file_saved", extra={"path": str(saved_path)})
    except Exception as exc:
        logger.error("extraction_file_save_failed", extra={"error": str(exc)})

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
