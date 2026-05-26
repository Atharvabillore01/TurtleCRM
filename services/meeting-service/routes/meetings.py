from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from config import settings
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


# Canonical list of CRM-agent agents available for ops to assign at scheduling time.
# Keep in sync with turtle-crm-agent/agents/__init__.py.
AVAILABLE_AGENTS: list[dict] = [
    {"name": "DemographicsAgent",  "touch_point": "Demographics & Family",       "phase": 1},
    {"name": "FinanceAgent",       "touch_point": "Finances",                    "phase": 1},
    {"name": "GoalsAgent",         "touch_point": "Life Goals",                  "phase": 1},
    {"name": "ProfessionalAgent",  "touch_point": "Professional Details",        "phase": 1},
    {"name": "ScheduleAgent",      "touch_point": "Schedule & Communication",    "phase": 1},
    {"name": "QualitativeAgent",   "touch_point": "Qualitative Parameters",      "phase": 1},
    {"name": "TaskAgent",          "touch_point": "Task Priority",               "phase": 2},
    {"name": "FeedbackAgent",      "touch_point": "Custom Fields",               "phase": 3},
    {"name": "SystemResolver",     "touch_point": "Turtle ID",                   "phase": 0},
]


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
    # Ops-selected agents to run on the post-meeting transcript. Empty = run all.
    agents_to_use: list[str] = []



@router.get("/agents")
async def list_available_agents():
    """List CRM-agent agents that ops can assign to a meeting at scheduling time."""
    return AVAILABLE_AGENTS


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
        agents_to_use=req.agents_to_use,
    )

    # ── Step 1: auto-create Google Meet + send calendar invites ─────────────────
    # Uses the Service Account + Domain-Wide Delegation (impersonates
    # settings.google_impersonate_email). No per-user token lookup needed.
    meet_url = req.meeting_url  # fallback if calendar creation fails
    google_event_id = ""

    try:
        attendees = list(filter(None, [
            req.client_email,
            *req.advisor_emails,
            *([] if not req.advisor_email or req.advisor_email in req.advisor_emails else [req.advisor_email]),
            *req.guests,
            "talk@turtlefinance.in",
        ]))
        cal_result = await create_meet_event(
            settings=settings,
            title=req.title or req.agenda,
            agenda=req.agenda,
            scheduled_at=req.scheduled_at,
            duration_minutes=req.duration_minutes,
            attendee_emails=attendees,
            timezone=settings.google_calendar_timezone,
            calendar_id=settings.google_calendar_id,
        )
        meet_url = cal_result["meet_url"] or meet_url
        google_event_id = cal_result["event_id"]
        logger.info("google_meet_created", extra={"meeting_id": meeting_id, "meet_url": meet_url})
    except Exception as exc:
        logger.warning("google_calendar_failed", extra={"error": str(exc), "meeting_id": meeting_id})

    # Fireflies bot is invited via calendar attendee (firefly_bot_email) — no API call needed.
    await proc_update_meeting_firefly_id(
        meeting_id=meeting_id,
        firefly_meeting_id=f"pending-{meeting_id}",
        firefly_meeting_url=meet_url,
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


@router.get("/transcript/{firefly_meeting_id}")
async def get_transcript_by_firefly_id(firefly_meeting_id: str):
    """
    Fetch a transcript directly from Fireflies by their meeting id.
    Useful for pulling transcripts from older meetings that weren't scheduled
    through this service.
    """
    if not settings.firefly_api_key:
        raise HTTPException(status_code=500, detail="FIREFLY_API_KEY is not configured")
    try:
        client = FireflyClient(settings.firefly_api_key)
        result = await client.get_transcript(firefly_meeting_id)
    except Exception as exc:
        logger.error("firefly_transcript_fetch_failed", extra={
            "error": str(exc), "firefly_meeting_id": firefly_meeting_id,
        })
        raise HTTPException(status_code=502, detail=f"Fireflies API error: {exc}")
    return {
        "firefly_meeting_id": firefly_meeting_id,
        "title": result["title"],
        "meeting_link": result["meeting_link"],
        "transcript_url": result["transcript_url"],
        "duration": result["duration"],
        "transcript": result["text"],
    }


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
