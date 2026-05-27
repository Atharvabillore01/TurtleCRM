"""
PROD MODE — listens for call.transcript.ready events and auto-triggers CRM extraction.
In DEV MODE the UI sends transcripts manually via POST /crm/extract instead.
"""
import datetime
import logging

import httpx

from config import settings
from eventbus import publish_event, start_consumer

logger = logging.getLogger(__name__)


async def handle_transcript_ready(payload: dict) -> None:
    client_id = payload.get("clientId", "")
    client_name = payload.get("clientName", "")
    transcript = payload.get("transcript", "")

    if not transcript:
        logger.warning("transcript_ready_missing_transcript", extra={"client_id": client_id})
        return

    logger.info("transcript_ready_received", extra={"client_id": client_id})

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.crm_ai_service_url}/extract",
                json={
                    "transcript": transcript,
                    "client_id": client_id,
                    "client_name": client_name,
                },
            )
            resp.raise_for_status()
            ai_result: dict = resp.json()
    except Exception as exc:
        logger.error("auto_extract_failed", extra={"client_id": client_id, "error": str(exc)})
        return

    await publish_event("crm.fields.extracted", {
        "clientId": client_id,
        "clientName": client_name,
        "extractedFields": ai_result,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
    logger.info("auto_crm_extracted", extra={"client_id": client_id})


async def start_consumers() -> None:
    await start_consumer(
        topic="call.transcript.ready",
        queue_prefix="user-service-group",
        handler=handle_transcript_ready,
    )
