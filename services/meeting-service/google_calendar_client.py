"""
Google Calendar client — creates Calendar events with Google Meet links using
a stored user OAuth token (obtained when the internal team member logged in).

User OAuth (not service account) can:
  - Create Meet links via conferenceData
  - Send calendar invite emails to attendees
  - No Domain-Wide Delegation or Workspace required

The OAuth token is stored in Redis by the auth-service after Google login
under key: google_cal_token:{user_id}
"""

import asyncio
import uuid
from datetime import datetime, timedelta

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from logger import get_logger

logger = get_logger("meeting-service")

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


async def create_meet_event(
    settings,
    title: str,
    agenda: str,
    scheduled_at: str,
    duration_minutes: int,
    attendee_emails: list[str],
    timezone: str = "Asia/Kolkata",
    google_access_token: str | None = None,
    google_refresh_token: str | None = None,
) -> dict:
    """Returns { meet_url, event_id, event_link }."""
    if not google_access_token:
        raise RuntimeError(
            "No Google OAuth token for the scheduling user. "
            "Have the ops team log in via Google first."
        )

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
        google_access_token,
        google_refresh_token,
    )


def _create_event_sync(
    settings,
    title: str,
    agenda: str,
    scheduled_at: str,
    duration_minutes: int,
    attendee_emails: list[str],
    tz: str,
    access_token: str,
    refresh_token: str | None,
) -> dict:
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
    )

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    start_dt = _parse_datetime(scheduled_at)
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    event_body = {
        "summary": title,
        "description": agenda,
        "start": {"dateTime": start_dt.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": tz},
        "end":   {"dateTime": end_dt.strftime("%Y-%m-%dT%H:%M:%S"),   "timeZone": tz},
        "attendees": [{"email": e} for e in attendee_emails if e],
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
            calendarId="primary",
            body=event_body,
            conferenceDataVersion=1,
            sendUpdates="none",
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
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M",
        "%d-%m-%Y %I:%M %p",
        "%d-%m-%Y %H:%M",
    ):
        try:
            return datetime.strptime(value.strip(), fmt).replace(tzinfo=None)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse scheduled_at: {value!r}")
