"""
Google Calendar client — creates Calendar events with Google Meet links.

Uses OAuth2 user credentials (refresh token) for the ops team email so that
attendee invites work without Domain-Wide Delegation or service accounts.

Required env vars:
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   — OAuth2 app credentials
  GOOGLE_CALENDAR_REFRESH_TOKEN            — refresh token for the ops email
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from logger import get_logger

logger = get_logger("meeting-service")

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _build_credentials(settings) -> Credentials:
    refresh_token = getattr(settings, "google_calendar_refresh_token", "") or ""
    if not refresh_token:
        raise RuntimeError(
            "GOOGLE_CALENDAR_REFRESH_TOKEN is not set. "
            "Run scripts/get_calendar_token.py once to generate it."
        )
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri=_TOKEN_URI,
        scopes=SCOPES,
    )
    # Eagerly refresh so the access token is valid before the API call.
    creds.refresh(Request())
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
