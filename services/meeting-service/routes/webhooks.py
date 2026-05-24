"""
Fireflies webhook receiver.

Fireflies POSTs to /webhooks/firefly when a meeting moves through its lifecycle:
  - meeting.transcribed → fetch transcript via GraphQL, save to file, publish event
  - meeting.summarized  → acknowledged (not consumed yet)

The webhook payload is minimal: { event, timestamp, meeting_id }. The real
transcript + metadata (title, meeting_link, transcript_url, duration) are
pulled from the Fireflies GraphQL API using the meeting_id.
"""

import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status

from config import settings
from eventbus import publish_event
from firefly_client import FireflyClient
from logger import get_logger

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = get_logger("meeting-service")

TRANSCRIPTS_DIR = Path(os.environ.get("TRANSCRIPTS_DIR", "/app/transcripts"))

# Temporary hardcoded allowlist while we don't have a DB-backed scheduled-meeting
# join. Only transcripts whose meeting_link matches one of these are processed.
# TODO: replace with a DB lookup by meet_url once the meetings table is live.
ALLOWED_MEET_URLS = {
    "https://meet.google.com/jec-cfnd-wdg",
}


def _meet_url_matches(meet_url: str) -> bool:
    if not meet_url:
        return False
    normalized = meet_url.strip().rstrip("/").lower()
    return any(u.strip().rstrip("/").lower() == normalized for u in ALLOWED_MEET_URLS)

TRANSCRIBED_EVENTS = {
    "meeting.transcribed",
    "Transcription completed",
    "transcript_ready",
    "TRANSCRIPT_READY",
    "Meeting Transcribed",
}
SUMMARIZED_EVENTS = {
    "meeting.summarized",
    "Meeting completed",
    "meeting_completed",
    "MEETING_COMPLETED",
}


def _save_transcript_to_file(firefly_meeting_id: str, title: str, meet_url: str,
                             transcript_url: str, duration: float,
                             transcript_text: str) -> Path:
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_title = re.sub(r"[^A-Za-z0-9_-]+", "_", title)[:60] or "untitled"
    path = TRANSCRIPTS_DIR / f"{firefly_meeting_id}_{safe_title}.txt"
    header = (
        f"Firefly ID: {firefly_meeting_id}\n"
        f"Title:      {title}\n"
        f"Meet URL:   {meet_url}\n"
        f"View URL:   {transcript_url}\n"
        f"Duration:   {duration} min\n"
        f"Saved at:   {datetime.now(timezone.utc).isoformat()}\n"
        f"{'-' * 80}\n\n"
    )
    path.write_text(header + transcript_text, encoding="utf-8")
    return path


def _verify_signature(body: bytes, signature: str) -> bool:
    if not settings.firefly_webhook_secret:
        return True  # skip verification in dev when secret not set
    if "=" in signature:
        signature = signature.split("=", 1)[1]  # strip "sha256=" prefix
    expected = hmac.new(
        settings.firefly_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/firefly", status_code=status.HTTP_200_OK)
async def firefly_webhook(request: Request):
    body = await request.body()
    sig = (
        request.headers.get("x-hub-signature")
        or request.headers.get("x-hub-signature-256")
        or request.headers.get("x-fireflies-signature")
        or request.headers.get("x-signature")
        or ""
    )
    if not _verify_signature(body, sig):
        logger.warning("firefly_signature_mismatch", extra={"received": sig})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    payload = json.loads(body)
    event_type = (
        payload.get("event")
        or payload.get("eventType")
        or payload.get("event_type", "")
    )
    firefly_meeting_id = (
        payload.get("meeting_id")
        or payload.get("meetingId")
        or (payload.get("meeting") or {}).get("id", "")
    )

    logger.info("firefly_webhook_received", extra={
        "event_type": event_type,
        "firefly_meeting_id": firefly_meeting_id,
    })

    if event_type in TRANSCRIBED_EVENTS:
        await _handle_transcript_ready(firefly_meeting_id)
    elif event_type in SUMMARIZED_EVENTS:
        logger.info("firefly_summary_ack", extra={"firefly_meeting_id": firefly_meeting_id})
    else:
        logger.warning("firefly_unknown_event", extra={"event_type": event_type})

    return {"received": True}


async def _handle_transcript_ready(firefly_meeting_id: str) -> None:
    """Fetch the transcript from Fireflies, save to disk, publish meeting.transcribed."""
    if not settings.firefly_api_key:
        logger.warning("firefly_api_key_missing", extra={"firefly_meeting_id": firefly_meeting_id})
        return
    if not firefly_meeting_id:
        logger.warning("firefly_meeting_id_missing")
        return

    try:
        client = FireflyClient(settings.firefly_api_key)
        result = await client.get_transcript(firefly_meeting_id)
    except Exception as exc:
        logger.error("firefly_transcript_fetch_failed", extra={
            "error": str(exc), "firefly_meeting_id": firefly_meeting_id,
        })
        return

    transcript_text = result["text"] or "[transcript unavailable]"
    meet_url = result["meeting_link"]
    title = result["title"]
    transcript_url = result["transcript_url"]
    duration = result["duration"]

    if not _meet_url_matches(meet_url):
        logger.info("firefly_transcript_skipped_meet_url_filter", extra={
            "firefly_meeting_id": firefly_meeting_id,
            "meet_url": meet_url,
            "allowed": list(ALLOWED_MEET_URLS),
        })
        return

    try:
        saved_path = _save_transcript_to_file(
            firefly_meeting_id=firefly_meeting_id,
            title=title,
            meet_url=meet_url,
            transcript_url=transcript_url,
            duration=duration,
            transcript_text=transcript_text,
        )
    except Exception as exc:
        logger.error("transcript_file_save_failed", extra={"error": str(exc)})
        return

    logger.info("transcript_saved", extra={
        "firefly_meeting_id": firefly_meeting_id,
        "title": title,
        "meet_url": meet_url,
        "transcript_url": transcript_url,
        "duration": duration,
        "chars": len(transcript_text),
        "path": str(saved_path),
    })

    # Publish for the next phase (agent extraction). Carries everything the
    # downstream worker needs without requiring a DB row.
    await publish_event("meeting.transcribed", {
        "firefly_meeting_id": firefly_meeting_id,
        "title": title,
        "meet_url": meet_url,
        "transcript_url": transcript_url,
        "duration_seconds": int(duration or 0),
        "transcript_path": str(saved_path),
        "transcript_text": transcript_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("transcript_event_published", extra={"firefly_meeting_id": firefly_meeting_id})
