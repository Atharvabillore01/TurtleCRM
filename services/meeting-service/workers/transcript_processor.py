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


# Canonical list of CRM extraction agents. When the caller doesn't specify
# `agents_to_use` (or sends an empty list) we expand to ALL agents so the
# full 174-field extraction runs. Mirrors the AVAILABLE_AGENTS list in
# meeting-service/routes/meetings.py.
ALL_EXTRACTION_AGENTS = [
    "DemographicsAgent",
    "FinanceAgent",
    "GoalsAgent",
    "ProfessionalAgent",
    "ScheduleAgent",
    "QualitativeAgent",
    "TaskAgent",
    "FeedbackAgent",
    "AdvisoryAgent",
    "SystemResolver",
]


async def _handle_transcribed(payload: dict) -> None:
    firefly_meeting_id = payload.get("firefly_meeting_id", "")
    meeting_id         = payload.get("meeting_id", "")
    client_id          = payload.get("client_id", "")
    agenda             = payload.get("agenda", "")
    agents_to_use_raw  = payload.get("agents_to_use", [])
    transcript_text    = payload.get("transcript_text", "")

    # Explicit policy: empty / missing agents_to_use → run ALL agents.
    # The CRM-AI orchestrator already does this implicitly, but being
    # explicit here makes the log line meaningful and prevents any
    # silent agent-defaulting surprises on the agent side.
    agents_to_use = (
        agents_to_use_raw
        if isinstance(agents_to_use_raw, list) and len(agents_to_use_raw) > 0
        else ALL_EXTRACTION_AGENTS
    )

    logger.info("transcript_processor_received", extra={
        "firefly_meeting_id": firefly_meeting_id,
        "meeting_id": meeting_id,
        "agents_to_use": agents_to_use,
        "agents_defaulted": agents_to_use is ALL_EXTRACTION_AGENTS,
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

    logger.info("ai_extraction_request_sent", extra={
        "meeting_id":         meeting_id,
        "extract_url":        extract_url,
        "transcript_chars":   len(transcript_text),
        "agents_requested":   agents_to_use,
        "agents_count":       len(agents_to_use),
    })

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
                logger.info("ai_extraction_response_received", extra={
                    "meeting_id":  meeting_id,
                    "attempt":     attempt,
                    "status":      resp.status_code,
                    "body_bytes":  len(resp.content),
                    "model":       extraction_data.get("model"),
                    "duration_s":  extraction_data.get("duration_seconds"),
                    "top_keys":    list(extraction_data.keys())[:10],
                })
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

    # ── Diagnostic logging — what CRM-AI actually returned ────────────────
    # When the AI Validation UI shows "0 fields extracted" but the extraction
    # row exists, the cause is almost always one of:
    #   (a) CRM-AI returned an empty `fields` dict
    #   (b) CRM-AI returned `fields` but only the system agents fired
    #   (c) sp_save_extraction silently dropped fields because of a schema issue
    # The log lines below let you tell which one.
    _fields_payload = extraction_data.get("fields", extraction_data)
    _agents_meta    = extraction_data.get("agents") or extraction_data.get("agents_run") or []
    # token_usage is keyed by agent with a synthetic "__total__" entry:
    #   { "demographics": {input_tokens, output_tokens, total_tokens}, ...,
    #     "__total__": {...} }
    # The per-meeting total lives under "__total__" — the old code read flat
    # input_tokens/output_tokens off the top level (always None). Fixed here.
    _token_usage    = extraction_data.get("token_usage") or {}
    _token_total    = _token_usage.get("__total__", {}) if isinstance(_token_usage, dict) else {}

    if isinstance(_fields_payload, dict):
        _field_ids       = sorted([int(k) for k in _fields_payload.keys() if str(k).isdigit()])
        _non_null_ids    = [
            fid for fid in _field_ids
            if _fields_payload.get(str(fid), {}).get("value") not in (None, "")
        ]
        _sample          = {
            str(k): {
                "value":            v.get("value"),
                "confidence":       v.get("confidence"),
                "source":           v.get("source"),
                "agent":            v.get("agent"),
            } if isinstance(v, dict) else v
            for k, v in list(_fields_payload.items())[:3]   # first 3 for grep
        }
    else:
        _field_ids    = []
        _non_null_ids = []
        _sample       = {"shape": type(_fields_payload).__name__}

    logger.info("ai_extraction_fields_breakdown", extra={
        "meeting_id":         meeting_id,
        "total_field_ids":    len(_field_ids),
        "non_null_count":     len(_non_null_ids),
        "non_null_ids":       _non_null_ids[:30],   # cap for log volume
        "agents_run":         _agents_meta,
        "model":              extraction_data.get("model"),
        "wall_seconds":       round(duration, 2),
        "agent_duration_s":   extraction_data.get("duration_seconds"),
        "input_tokens":       _token_total.get("input_tokens"),
        "output_tokens":      _token_total.get("output_tokens"),
        "total_tokens":       _token_total.get("total_tokens"),
        "agents_with_tokens": [k for k in _token_usage if k != "__total__"] if isinstance(_token_usage, dict) else [],
        "sample_fields":      _sample,
    })

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
            # Migration 025: persist per-agent token usage. sp_save_extraction
            # explodes this into extraction_token_usage rows ("__total__" skipped).
            token_usage=_token_usage if isinstance(_token_usage, dict) else None,
            # Migration 027: standalone AdvisoryAgent coaching report (NOT a
            # CRM field). Stored verbatim on extractions.call_analysis.
            call_analysis=(
                extraction_data.get("call_analysis")
                if isinstance(extraction_data.get("call_analysis"), dict)
                else None
            ),
        )
    except (ValueError, RuntimeError) as exc:
        logger.error("save_extraction_failed", extra={
            "error":            str(exc),
            "meeting_id":       meeting_id,
            "job_id":           job_id,
            "fields_sent":      len(_fields_payload) if isinstance(_fields_payload, dict) else 0,
            "non_null_sent":    len(_non_null_ids),
        })
        return

    # Post-save audit: read back how many extraction_fields actually landed,
    # so we can detect the case where the worker sent N fields but the SP
    # only persisted M (silent drop / type mismatch).
    persisted_count = -1
    try:
        from db.pool import get_pool
        async with get_pool().acquire() as conn:
            persisted_count = await conn.fetchval(
                "SELECT COUNT(*) FROM extraction_fields WHERE extraction_id = $1::uuid",
                extraction_id,
            )
    except Exception:
        pass

    extractions_completed_total.inc()
    logger.info("extraction_completed", extra={
        "extraction_id":     extraction_id,
        "meeting_id":        meeting_id,
        "duration_seconds":  round(duration, 3),
        "fields_sent_to_sp": len(_fields_payload) if isinstance(_fields_payload, dict) else 0,
        "fields_persisted":  persisted_count,
        "non_null_count":    len(_non_null_ids),
    })
    if isinstance(_fields_payload, dict) and persisted_count >= 0 \
       and persisted_count < len(_fields_payload):
        logger.warning("extraction_fields_drop_detected", extra={
            "meeting_id":       meeting_id,
            "extraction_id":    extraction_id,
            "sent":             len(_fields_payload),
            "persisted":        persisted_count,
            "diff":             len(_fields_payload) - persisted_count,
            "hint":             "SP silently dropped fields — check field_definitions for missing field_ids",
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
    """Supervises the meeting.transcribed consumer.

    `asyncio.create_task` in main.py launches this as a fire-and-forget task.
    If the consumer's underlying RabbitMQ connection fails — most commonly a
    cold-start race where the AMQP listener isn't accepting yet even though
    the container's healthcheck passes — the original code died silently and
    the queue accumulated events with no consumer attached.

    This supervisor loop retries forever with exponential backoff capped at
    30s, logging each failure so it's visible in `docker compose logs`.
    """
    attempt = 0
    while True:
        attempt += 1
        try:
            await start_consumer(
                "meeting.transcribed",
                "meeting-service-transcript",
                _handle_transcribed,
            )
            # start_consumer normally blocks. If it ever returns cleanly, the
            # consumer was closed externally — loop and reconnect.
            logger.warning("transcript_processor_consumer_returned", extra={"attempt": attempt})
        except Exception as exc:
            backoff = min(30, 2 ** min(attempt, 5))   # 2,4,8,16,32→30,30,30,…
            logger.exception("transcript_processor_consumer_failed", extra={
                "attempt": attempt,
                "next_retry_s": backoff,
                "error": str(exc),
            })
            await asyncio.sleep(backoff)
