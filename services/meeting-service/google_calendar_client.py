"""
Google Calendar client — creates Calendar events with Google Meet links.

Uses the scheduling internal user's OAuth2 tokens (saved to Redis at login)
so that Meet link generation works without service accounts or a shared secret.
"""

import asyncio
import uuid
from datetime import datetime, timedelta

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from logger import get_logger

logger = get_logger("meeting-service")

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _build_credentials(settings, refresh_token: str) -> Credentials:
    if not refresh_token:
        raise RuntimeError(
            "No Google refresh token available for this user. "
            "The internal user must log in via Google OAuth before scheduling."
        )
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri=_TOKEN_URI,
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds


async def create_meet_event(
    settings,
    title: str,
    agenda: str,
    scheduled_at: str,
    duration_minutes: int,
    attendee_emails: list[str],
    refresh_token: str,
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
        refresh_token,
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
    refresh_token: str,
    tz: str,
    calendar_id: str,
) -> dict:
    creds = _build_credentials(settings, refresh_token)
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
