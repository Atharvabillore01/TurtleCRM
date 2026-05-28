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
from db.meeting_procs import proc_find_meeting_by_meet_url
from eventbus import publish_event
from firefly_client import FireflyClient
from logger import get_logger

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = get_logger("meeting-service")

TRANSCRIPTS_DIR = Path(os.environ.get("TRANSCRIPTS_DIR", "/app/transcripts"))

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


@router.post("/firefly/replay", status_code=status.HTTP_200_OK)
async def firefly_webhook_replay(request: Request):
    """
    Dev-only replay endpoint. Skips HMAC, accepts:
        { "firefly_meeting_id": "<id>", "meet_url": "<https://meet.google.com/...>" }
    Use `meet_url` to point the lookup at a meeting you scheduled locally
    instead of whatever Meet URL Fireflies recorded for the original meeting.
    Disabled in production.
    """
    if settings.node_env == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    body = await request.body()
    try:
        payload = json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON body: {exc.msg} at char {exc.pos}",
        )
    firefly_meeting_id = (
        payload.get("firefly_meeting_id")
        or payload.get("meeting_id")
        or ""
    )
    meet_url_override = payload.get("meet_url") or None

    if not firefly_meeting_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="firefly_meeting_id is required",
        )

    logger.info("firefly_replay_invoked", extra={
        "firefly_meeting_id": firefly_meeting_id,
        "meet_url_override":  meet_url_override,
    })
    await _handle_transcript_ready(firefly_meeting_id, meet_url_override=meet_url_override)
    return {"replayed": True, "firefly_meeting_id": firefly_meeting_id}


async def _handle_transcript_ready(
    firefly_meeting_id: str,
    meet_url_override: str | None = None,
) -> None:
    """Fetch the transcript from Fireflies, save to disk, publish meeting.transcribed.

    `meet_url_override` is for the dev replay endpoint only — when set, the
    Meet URL returned by Fireflies is ignored and the override is used for
    the meeting-row lookup. Lets developers replay a real Fireflies
    meeting_id against a meeting they just scheduled locally.
    """
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
    meet_url = meet_url_override or result["meeting_link"]
    title = result["title"]
    transcript_url = result["transcript_url"]
    duration = result["duration"]
    if meet_url_override:
        logger.info("firefly_meet_url_override_active", extra={
            "firefly_meeting_id": firefly_meeting_id,
            "from_fireflies": result["meeting_link"],
            "override":       meet_url_override,
        })

    # Find the scheduled meeting row by Meet URL. fn_find_meeting_by_meet_url
    # returns a dict (or None) with: id, agenda, agents_to_use (list),
    # client_user_ids (list of str UUIDs), adviser_user_ids, metadata, …
    try:
        meeting_row = await proc_find_meeting_by_meet_url(meet_url)
    except Exception as exc:
        logger.error("firefly_meeting_lookup_failed", extra={
            "error": str(exc), "meet_url": meet_url,
        })
        return
    if meeting_row is None:
        logger.info("firefly_transcript_no_matching_meeting", extra={
            "firefly_meeting_id": firefly_meeting_id,
            "meet_url": meet_url,
        })
        return

    client_user_ids = meeting_row.get("client_user_ids") or []
    ctx = {
        "meeting_id":    meeting_row["id"],
        "client_id":     client_user_ids[0] if client_user_ids else "",
        "agenda":        meeting_row.get("agenda") or "",
        "agents_to_use": list(meeting_row.get("agents_to_use") or []),
    }

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
    # downstream worker needs without requiring a DB row — including the
    # hardcoded meeting context (client_id, agents_to_use, agenda).
    await publish_event("meeting.transcribed", {
        "firefly_meeting_id": firefly_meeting_id,
        "title": title,
        "meet_url": meet_url,
        "transcript_url": transcript_url,
        "duration_seconds": int(duration or 0),
        "transcript_path": str(saved_path),
        "transcript_text": transcript_text,
        # ── meeting context (will come from DB once rows exist) ──
        "meeting_id":    ctx["meeting_id"],
        "client_id":     ctx["client_id"],
        "agenda":        ctx["agenda"],
        "agents_to_use": ctx["agents_to_use"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("transcript_event_published", extra={"firefly_meeting_id": firefly_meeting_id})
