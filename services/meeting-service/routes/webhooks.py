"""
Fireflies webhook receiver.

Fireflies POSTs to /webhooks/firefly when:
  - meeting_completed  (recording done)
  - transcript_ready   (transcript available)

Payload shape varies by event type; we handle both cases here.
"""

import hashlib
import hmac
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status

from config import settings
from db.meeting_procs import proc_update_meeting_status, proc_save_transcript
from eventbus import publish_event
from firefly_client import FireflyClient
from logger import get_logger

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = get_logger("meeting-service")


def _verify_signature(body: bytes, signature: str) -> bool:
    if not settings.firefly_webhook_secret:
        return True  # skip verification in dev when secret not set
    expected = hmac.new(  # type: ignore[attr-defined]
        settings.firefly_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/firefly", status_code=status.HTTP_200_OK)
async def firefly_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("x-fireflies-signature", "")

    if not _verify_signature(body, sig):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    payload = json.loads(body)
    event_type = payload.get("eventType") or payload.get("event_type", "")
    meeting_data = payload.get("meeting") or payload.get("data", {})
    firefly_meeting_id = meeting_data.get("id") or payload.get("meetingId", "")

    logger.info("firefly_webhook_received", extra={"event_type": event_type, "firefly_meeting_id": firefly_meeting_id})

    if event_type in ("Transcription completed", "transcript_ready", "TRANSCRIPT_READY"):
        await _handle_transcript_ready(firefly_meeting_id, meeting_data)
    elif event_type in ("Meeting completed", "meeting_completed", "MEETING_COMPLETED"):
        await proc_update_meeting_status(
            firefly_meeting_id=firefly_meeting_id,
            status="completed",
            ended_at=datetime.now(timezone.utc).isoformat(),
        )
    else:
        logger.warning("firefly_unknown_event", extra={"event_type": event_type})

    return {"received": True}


async def _handle_transcript_ready(firefly_meeting_id: str, meeting_data: dict) -> None:
    transcript_text = ""
    if settings.firefly_api_key:
        try:
            client = FireflyClient(settings.firefly_api_key)
            transcript_text = await client.get_transcript(firefly_meeting_id)
        except Exception as exc:
            logger.warning("firefly_transcript_fetch_failed", extra={"error": str(exc)})

    if not transcript_text:
        transcript_text = meeting_data.get("transcript", "[transcript unavailable]")

    try:
        meeting_id = await proc_update_meeting_status(
            firefly_meeting_id=firefly_meeting_id,
            status="transcribed",
            ended_at=datetime.now(timezone.utc).isoformat(),
        )
        await proc_save_transcript(
            meeting_id=meeting_id,
            transcript_text=transcript_text,
            transcript_url=meeting_data.get("transcript_url", ""),
            duration_seconds=int(meeting_data.get("duration", 0)),
        )
    except RuntimeError as exc:
        logger.error("transcript_save_failed", extra={"error": str(exc), "firefly_meeting_id": firefly_meeting_id})
        return

    await publish_event("meeting.transcribed", {
        "firefly_meeting_id": firefly_meeting_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("transcript_saved_and_published", extra={"firefly_meeting_id": firefly_meeting_id})
