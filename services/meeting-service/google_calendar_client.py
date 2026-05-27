"""
Google Calendar client — creates Calendar events with Google Meet links.

Uses a Google Service Account with Domain-Wide Delegation that impersonates
a Workspace user (configured via GOOGLE_IMPERSONATE_EMAIL).
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta

from google.oauth2 import service_account
from googleapiclient.discovery import build

from logger import get_logger

logger = get_logger("meeting-service")

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.freebusy",
]


def _build_credentials(settings):
    key_path = settings.google_service_account_file
    impersonate = (settings.google_impersonate_email or "").strip()
    if not os.path.exists(key_path):
        raise RuntimeError(
            f"Service account key file not found at {key_path!r}. "
            "Set GOOGLE_SERVICE_ACCOUNT_FILE and mount the key into the container."
        )
    if not impersonate:
        raise RuntimeError(
            "GOOGLE_IMPERSONATE_EMAIL is not set. Domain-Wide Delegation requires "
            "a Workspace user to impersonate."
        )
    creds = service_account.Credentials.from_service_account_file(
        key_path, scopes=SCOPES
    ).with_subject(impersonate)
    return creds


async def create_meet_event(
    settings,
    title: str,
    agenda: str,
    scheduled_at: str,
    duration_minutes: int,
    attendee_emails: list[str],
    timezone: str = "Asia/Kolkata",
    calendar_id: str = "primary",
) -> dict:
    """Returns { meet_url, event_id, event_link }."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        _create_event_sync,
        settings,
        title,
        agenda,
        scheduled_at,
        duration_minutes,
        attendee_emails,
        timezone,
        calendar_id,
    )


def _create_event_sync(
    settings,
    title: str,
    agenda: str,
    scheduled_at: str,
    duration_minutes: int,
    attendee_emails: list[str],
    tz: str,
    calendar_id: str,
) -> dict:
    creds = _build_credentials(settings)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    start_dt = _parse_datetime(scheduled_at)
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    event_body = {
        "summary": title,
        "description": agenda,
        "start": {"dateTime": start_dt.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": tz},
        "end":   {"dateTime": end_dt.strftime("%Y-%m-%dT%H:%M:%S"),   "timeZone": tz},
        "attendees": [{"email": e} for e in attendee_emails if e],
        "guestsCanInviteOthers": True,
        "guestsCanSeeOtherGuests": True,
        "anyoneCanAddSelf": True,
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }

    created = (
        service.events()
        .insert(
            calendarId=calendar_id,
            body=event_body,
            conferenceDataVersion=1,
            sendUpdates="all",
        )
        .execute()
    )

    meet_url = (
        created.get("hangoutLink")
        or (created.get("conferenceData") or {}).get("entryPoints", [{}])[0].get("uri", "")
    )

    logger.info("google_meet_created", extra={
        "event_id": created.get("id"),
        "meet_url": meet_url,
        "attendees": attendee_emails,
    })

    return {
        "meet_url": meet_url,
        "event_id": created.get("id", ""),
        "event_link": created.get("htmlLink", ""),
    }


def _parse_datetime(value: str) -> datetime:
    s = value.strip()
    # fromisoformat handles fractional seconds and offsets; normalise Z → +00:00.
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        pass
    for fmt in ("%d-%m-%Y %I:%M %p", "%d-%m-%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=None)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse scheduled_at: {value!r}")
