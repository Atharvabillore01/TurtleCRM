from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

import json as _json

from config import settings
from redis_client import get_redis
from db.meeting_procs import (
    proc_cancel_meeting,
    proc_list_meetings,
    proc_schedule_meeting,
    proc_update_meeting_firefly_id,
)
from eventbus import publish_event
from firefly_client import FireflyClient
from google_calendar_client import create_meet_event
from logger import get_logger
from metrics import meetings_scheduled_total

router = APIRouter(prefix="/api/meetings", tags=["meetings"])
logger = get_logger("meeting-service")


class ScheduleMeetingRequest(BaseModel):
    client_id: str
    advisor_id: str
    scheduled_at: str
    duration_minutes: int = 60
    agenda: str
    meeting_url: str = ""
    created_by: str
    title: str = ""
    client_name: str = ""
    advisor_name: str = ""
    client_email: str = ""
    advisor_email: str = ""
    # multi-advisor support — TODO: wire to DB proc columns when sp_schedule_meeting is ready
    advisor_ids: list[str] = []
    advisor_names: list[str] = []
    advisor_emails: list[str] = []
    member: str = ""
    guests: list[str] = []
    notes: str = ""

    @property
    def attendee_emails(self) -> list[str]:
        # Use per-advisor emails if provided, otherwise fall back to single advisor_email
        emails = self.advisor_emails if self.advisor_emails else ([self.advisor_email] if self.advisor_email else [])
        return list({e for e in [self.client_email, *emails] if e})


@router.get("/")
async def list_meetings():
    try:
        return await proc_list_meetings()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schedule", status_code=status.HTTP_201_CREATED)
async def schedule_meeting(req: ScheduleMeetingRequest):
    meeting_id = await proc_schedule_meeting(
        client_id=req.client_id,
        advisor_id=req.advisor_ids[0] if req.advisor_ids else req.advisor_id,
        scheduled_at=req.scheduled_at,
        duration_minutes=req.duration_minutes,
        agenda=req.agenda,
        created_by=req.created_by,
        title=req.title or req.agenda,
        client_name=req.client_name,
        advisor_name=req.advisor_name,
        advisor_ids=req.advisor_ids or ([req.advisor_id] if req.advisor_id else []),
        advisor_names=req.advisor_names or ([req.advisor_name] if req.advisor_name else []),
        member=req.member,
        guests=req.guests,
        notes=req.notes,
        meeting_url=req.meeting_url,
    )

    # ── Step 1: auto-create Google Meet + send calendar invites ─────────────────
    meet_url = req.meeting_url  # fallback if no Google token available
    google_event_id = ""

    # Fetch the scheduling user's stored Google OAuth token from Redis
    google_access_token = None
    google_refresh_token = None
    if req.created_by:
        try:
            raw = await get_redis().get(f"google_cal_token:{req.created_by}")
            if raw:
                tok = _json.loads(raw)
                google_access_token = tok.get("access_token")
                google_refresh_token = tok.get("refresh_token")
        except Exception as exc:
            logger.warning("redis_token_fetch_failed", extra={"error": str(exc), "created_by": req.created_by})

    if google_access_token:
        try:
            cal_result = await create_meet_event(
                settings=settings,
                title=req.title or req.agenda,
                agenda=req.agenda,
                scheduled_at=req.scheduled_at,
                duration_minutes=req.duration_minutes,
                attendee_emails=req.attendee_emails,
                timezone=settings.google_calendar_timezone,
                google_access_token=google_access_token,
                google_refresh_token=google_refresh_token,
            )
            meet_url = cal_result["meet_url"] or meet_url
            google_event_id = cal_result["event_id"]
            logger.info("google_meet_created", extra={"meeting_id": meeting_id, "meet_url": meet_url})
        except Exception as exc:
            logger.warning("google_calendar_failed", extra={"error": str(exc), "meeting_id": meeting_id})

    # ── Step 2: invite Fireflies bot to the Meet URL ─────────────────────────
    firefly_result = {"firefly_meeting_id": None, "firefly_meeting_url": meet_url}
    if settings.firefly_api_key and meet_url:
        try:
            client = FireflyClient(settings.firefly_api_key)
            firefly_result = await client.add_to_meeting(
                meeting_url=meet_url,
                title=req.title or req.agenda,
                scheduled_at=req.scheduled_at,
            )
        except Exception as exc:
            logger.warning("firefly_add_failed", extra={"error": str(exc), "meeting_id": meeting_id})

    await proc_update_meeting_firefly_id(
        meeting_id=meeting_id,
        firefly_meeting_id=firefly_result.get("firefly_meeting_id") or f"pending-{meeting_id}",
        firefly_meeting_url=firefly_result.get("firefly_meeting_url") or meet_url,
    )

    await publish_event("meeting.scheduled", {
        "meeting_id": meeting_id,
        "client_id": req.client_id,
        "client_name": req.client_name,
        "client_email": req.client_email,
        "advisor_id": req.advisor_ids[0] if req.advisor_ids else req.advisor_id,
        "advisor_ids": req.advisor_ids or ([req.advisor_id] if req.advisor_id else []),
        "advisor_names": req.advisor_names or ([req.advisor_name] if req.advisor_name else []),
        "advisor_emails": req.advisor_emails or ([req.advisor_email] if req.advisor_email else []),
        "scheduled_at": req.scheduled_at,
        "duration_minutes": req.duration_minutes,
        "title": req.title or req.agenda,
        "agenda": req.agenda,
        "meet_url": meet_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    meetings_scheduled_total.inc()
    logger.info("meeting_scheduled", extra={"meeting_id": meeting_id, "client_id": req.client_id, "meet_url": meet_url})
    return {"meeting_id": meeting_id, "status": "scheduled", "meet_url": meet_url, "google_event_id": google_event_id}


@router.delete("/{meeting_id}", status_code=status.HTTP_200_OK)
async def cancel_meeting(meeting_id: str, cancelled_by: str = "system", reason: str = ""):
    try:
        await proc_cancel_meeting(
            meeting_id=meeting_id,
            cancelled_by=cancelled_by,
            cancellation_reason=reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await publish_event("meeting.cancelled", {
        "meeting_id": meeting_id,
        "cancelled_by": cancelled_by,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("meeting_cancelled", extra={"meeting_id": meeting_id})
    return {"meeting_id": meeting_id, "status": "cancelled"}
