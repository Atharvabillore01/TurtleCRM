"""
Google Calendar client — creates events with an auto-generated Google Meet link
and sends calendar invites to all attendees.

Auth: Google service account key (JSON file path or raw JSON string in env).
The service account must have the Calendar API enabled in Google Cloud Console
and be granted "Make changes to events" on the target calendar
(or domain-wide delegation for Workspace accounts).

Setup checklist:
  1. Google Cloud Console → APIs & Services → Enable "Google Calendar API"
  2. Create a service account → generate a JSON key
  3. Share your Google Calendar with the service account email (or use domain-wide delegation)
  4. Set GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json  (or GOOGLE_SERVICE_ACCOUNT_JSON=<raw json>)
  5. Set GOOGLE_CALENDAR_ID to the organiser's calendar email (default: "primary")
"""

import json
import uuid
from datetime import datetime, timedelta, timezone

from logger import get_logger

logger = get_logger("meeting-service")

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def _build_service(settings):
    """Build a Google Calendar API service from service account credentials."""
    import json as _json
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    if settings.google_service_account_json:
        info = _json.loads(settings.google_service_account_json)
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    elif settings.google_service_account_file:
        creds = service_account.Credentials.from_service_account_file(
            settings.google_service_account_file, scopes=SCOPES
        )
    else:
        raise RuntimeError(
            "Google Calendar not configured. "
            "Set GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_JSON."
        )
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


async def create_meet_event(
    settings,
    title: str,
    agenda: str,
    scheduled_at: str,
    duration_minutes: int,
    attendee_emails: list[str],
    timezone: str = "Asia/Kolkata",
) -> dict:
    """
    Create a Google Calendar event with a Meet link.
    Returns { meet_url, event_id, event_link }.
    Runs the blocking googleapis call in a thread pool.
    """
    import asyncio
    loop = asyncio.get_event_loop()
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
    )


def _create_event_sync(
    settings,
    title: str,
    agenda: str,
    scheduled_at: str,
    duration_minutes: int,
    attendee_emails: list[str],
    tz: str,
) -> dict:
    service = _build_service(settings)

    # Parse scheduled_at — accept ISO 8601 or "DD-MM-YYYY HH:MM AM/PM"
    start_dt = _parse_datetime(scheduled_at)
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    # Format as RFC3339 with offset
    start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%S")
    end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%S")

    event_body = {
        "summary": title,
        "description": agenda,
        "start": {"dateTime": start_str, "timeZone": tz},
        "end": {"dateTime": end_str, "timeZone": tz},
        "attendees": [{"email": email} for email in attendee_emails if email],
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
        "guestsCanModifyEvent": False,
        "sendUpdates": "all",  # sends invite emails to all attendees
    }

    created = (
        service.events()
        .insert(
            calendarId=settings.google_calendar_id,
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

    logger.info(
        "google_meet_created",
        extra={
            "event_id": created.get("id"),
            "meet_url": meet_url,
            "attendees": attendee_emails,
        },
    )

    return {
        "meet_url": meet_url,
        "event_id": created.get("id", ""),
        "event_link": created.get("htmlLink", ""),
    }


def _parse_datetime(value: str) -> datetime:
    """Parse ISO 8601 or DD-MM-YYYY HH:MM AM/PM into a naive datetime."""
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M",
        "%d-%m-%Y %I:%M %p",
        "%d-%m-%Y %H:%M",
    ):
        try:
            dt = datetime.strptime(value.strip(), fmt)
            # strip tzinfo — Calendar API wants a naive datetime + timeZone field
            return dt.replace(tzinfo=None)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse scheduled_at: {value!r}")
