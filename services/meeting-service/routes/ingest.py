"""
Manual ingest of past Fireflies meetings.

Flow:
  1. POST /api/meetings/ingest/preview { fireflies_url }
       → Parse fireflies_meeting_id from the URL,
       → Fetch transcript + attendees from Fireflies GraphQL,
       → Filter the bot, classify advisor vs client against team_users,
       → Return a diagnostic payload the UI can render before confirming.

  2. POST /api/meetings/ingest { fireflies_url, idempotency_key }
       → Re-fetch + re-classify server-side (never trust client to pass data),
       → Call sp_ingest_meeting_from_fireflies which atomically creates
         clients/client_users/access + meeting + attendees + transcript +
         external_sync,
       → Publish `meeting.transcribed` (same topic + payload shape the live
         Fireflies webhook publishes) so the existing transcript_processor
         worker runs the 174-field agents.

The route deliberately re-fetches Fireflies on /ingest rather than trusting
the preview payload — it's the only safe way to ensure the user can't tamper
with the email→advisor mapping client-side.
"""

import re as _re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_dep import get_current_team_user
from config import settings
from db.meeting_procs import proc_ingest_meeting_from_fireflies
from db.pool import get_pool
from eventbus import publish_event
from firefly_client import FireflyClient
from logger import get_logger
from routes.meetings import AVAILABLE_AGENTS

# Canonical agent names ops may assign per meeting. Single source of truth is
# AVAILABLE_AGENTS in routes/meetings.py (kept in sync with the CRM-agent).
_VALID_AGENT_NAMES = {a["name"] for a in AVAILABLE_AGENTS}

router = APIRouter(prefix="/api/meetings/ingest", tags=["ingest"])
logger = get_logger("meeting-service")

# Actor identity for ingested meetings. The team_user row with this email must
# exist + be active; otherwise the SP returns errornumber 1021.
ACTOR_EMAIL = "talk@turtlefinance.in"

# Emails that should NEVER be counted as a meeting participant:
#   - Fireflies bot      (appears as an attendee in the calendar event)
#   - The system actor   (typically the calendar OWNER — talk@turtlefinance.in
#                         is the impersonated Workspace user that created the
#                         Meet event via Domain-Wide Delegation, so it shows up
#                         in Fireflies' attendee list even though it didn't join)
IGNORED_ATTENDEE_EMAILS = {"fred@fireflies.ai", ACTOR_EMAIL.lower()}


class IngestPreviewRequest(BaseModel):
    fireflies_url: str


class IngestRequest(BaseModel):
    fireflies_url: str
    idempotency_key: str | None = None
    # Ops-selected agents to run on this meeting's transcript. Empty = run all.
    # Unknown names are dropped server-side (see ingest_meeting).
    agents_to_use: list[str] = []


# Google Meet codes are 10 lowercase letters + 2 hyphens, e.g. "rco-jucv-rwm".
_MEET_CODE_RE = _re.compile(r"^[a-z]{3,4}-?[a-z]{3,4}-?[a-z]{3,4}$", _re.IGNORECASE)


def _classify_input(raw: str) -> tuple[str, str]:
    """Decide whether the user pasted a Fireflies URL, a Google Meet
    URL, a bare Meet code, or a bare Fireflies id.

    Returns (kind, value) where kind ∈ {"firefly_id", "meet_code"}.
    """
    s = (raw or "").strip()
    if not s:
        raise ValueError("URL or meeting code is required.")

    low = s.lower()

    # Fireflies share URL.
    if "fireflies.ai" in low:
        last_segment = s.rstrip("/").split("/")[-1]
        if "::" in last_segment:
            last_segment = last_segment.split("::")[-1]
        last_segment = last_segment.split("?")[0]
        if not last_segment:
            raise ValueError(f"Could not extract a Fireflies id from {raw!r}.")
        return ("firefly_id", last_segment)

    # Google Meet URL — pull the code from the last path segment.
    if "meet.google.com" in low:
        last_segment = s.rstrip("/").split("/")[-1].split("?")[0]
        if not last_segment:
            raise ValueError(f"Could not extract a Meet code from {raw!r}.")
        return ("meet_code", last_segment)

    # No scheme / no slashes → it's either a Meet code (e.g. rco-jucv-rwm
    # or rcojucvrwm) or a bare Fireflies id.
    if "://" not in s and "/" not in s:
        if _MEET_CODE_RE.match(s):
            return ("meet_code", s)
        # Treat anything else as a bare Fireflies id (Fireflies ids are
        # opaque base-36-ish strings, not lowercase-hyphen patterns).
        return ("firefly_id", s)

    raise ValueError(
        f"Unrecognised input. Paste a Fireflies share URL, a Google Meet "
        f"URL, or a Meet code (e.g. rco-jucv-rwm). Got: {raw!r}"
    )


async def _resolve_to_firefly_id(raw: str, client: FireflyClient) -> str:
    """Normalise any accepted input into a Fireflies transcript id.
    Raises ValueError for malformed input and LookupError when a Meet code
    has no matching Fireflies transcript in the recent window."""
    kind, value = _classify_input(raw)
    if kind == "firefly_id":
        return value

    found = await client.find_transcript_id_by_meet_code(value)
    if not found:
        raise LookupError(
            f"No Fireflies transcript found for Meet code {value!r}. "
            "It may be too old (search covers the 50 most recent), "
            "or the meeting wasn't recorded by Fireflies."
        )
    return found


async def _lookup_existing_client(email: str) -> dict | None:
    """Return existing client_users row keyed by email, or None.
    Used by the preview to label the badge as 'Client' vs 'Client (new)'."""
    email_l = (email or "").strip().lower()
    if not email_l:
        return None
    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, name FROM client_users "
            " WHERE LOWER(email) = $1 LIMIT 1",
            email_l,
        )
    return dict(row) if row else None


async def _lookup_active_advisor(email: str) -> dict | None:
    """Match an email against the same source-of-truth the SP uses:
    `adviser_users JOIN advisors` with both rows active.

    Returns { adviser_user_id, advisor_id, email, full_name } or None.
    """
    email_l = (email or "").strip().lower()
    if not email_l:
        return None
    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT au.id   AS adviser_user_id, "
            "       a.id    AS advisor_id, "
            "       au.email, "
            "       au.name AS full_name "
            "  FROM adviser_users au "
            "  JOIN advisors a ON a.adviser_user_id = au.id "
            " WHERE LOWER(au.email) = $1 "
            "   AND au.is_active     = TRUE "
            "   AND a.is_active      = TRUE "
            " LIMIT 1",
            email_l,
        )
    return dict(row) if row else None


async def _classify_attendees(attendees: list[dict]) -> dict:
    """
    Filter the Fireflies bot, then split the remaining attendees into
    (advisor, client). Returns:
      {
        non_bot:        [ {email, displayName} ],
        advisor_match:  { id, email, full_name } | None,
        client:         { email, displayName }     | None,
        skip_reason:    str | None,   # populated when the meeting would be rejected
      }
    """
    non_bot = [
        a for a in attendees
        if a.get("email") and a["email"].lower() not in IGNORED_ATTENDEE_EMAILS
    ]
    out: dict = {
        "non_bot":       non_bot,
        "advisor_match": None,
        "client":        None,
        "skip_reason":   None,
    }

    if len(non_bot) != 2:
        out["skip_reason"] = (
            f"Expected exactly 2 non-bot attendees, found {len(non_bot)}."
        )
        return out

    # Match each candidate against adviser_users — same source the SP uses.
    matches: list[tuple[dict, dict | None]] = []
    for a in non_bot:
        adv = await _lookup_active_advisor(a["email"])
        matches.append((a, adv))

    advisors = [(a, t) for (a, t) in matches if t is not None]
    if not advisors:
        out["skip_reason"] = "No active advisor matched any attendee email."
        return out
    if len(advisors) == 2:
        # Both attendees are advisors — ambiguous. Reject and let ops decide.
        out["skip_reason"] = (
            "Both attendees are registered advisors — cannot determine which is the client."
        )
        return out

    _advisor_attendee, advisor_row = advisors[0]
    client_attendee = next(a for (a, t) in matches if t is None)
    out["advisor_match"] = advisor_row
    out["client"] = client_attendee
    return out


@router.post("/preview", status_code=status.HTTP_200_OK)
async def preview_ingest(
    req: IngestPreviewRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    """Diagnostic-only — does NOT write to the DB. Used by the UI to render
    a confirmation card before the user commits."""
    logger.info("ingest_preview_requested", extra={
        "input": req.fireflies_url, "requested_by": str(team_user_id),
    })

    client = FireflyClient(settings.firefly_api_key)
    try:
        fireflies_id = await _resolve_to_firefly_id(req.fireflies_url, client)
    except ValueError as exc:
        logger.info("ingest_preview_bad_input", extra={"input": req.fireflies_url, "error": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        logger.info("ingest_preview_not_found", extra={"input": req.fireflies_url, "error": str(exc)})
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("firefly_resolve_failed", extra={"input": req.fireflies_url})
        raise HTTPException(status_code=502, detail=f"Fireflies API error: {exc}")

    try:
        firefly = await client.fetch_for_ingest(fireflies_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("firefly_fetch_failed", extra={"fireflies_id": fireflies_id})
        raise HTTPException(status_code=502, detail=f"Fireflies API error: {exc}")

    classified = await _classify_attendees(firefly["attendees"])

    # Tell the UI whether the client already exists in our DB.
    existing_client = None
    if classified["client"]:
        existing_client = await _lookup_existing_client(classified["client"]["email"])

    # Has this Fireflies meeting already been ingested? And did extraction land?
    async with get_pool().acquire() as conn:
        existing_meeting_row = await conn.fetchrow(
            "SELECT meeting_id, updated_at "
            "  FROM meeting_external_sync "
            " WHERE booking_provider = 'fireflies' "
            "   AND external_meeting_id = $1 "
            " LIMIT 1",
            fireflies_id,
        )
        already_ingested_meeting_id = None
        extraction_exists = False
        if existing_meeting_row:
            already_ingested_meeting_id = str(existing_meeting_row["meeting_id"])
            extraction_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM extractions WHERE meeting_id = $1::uuid)",
                already_ingested_meeting_id,
            )

    logger.info("ingest_preview_done", extra={
        "fireflies_meeting_id": fireflies_id,
        "advisor_email":        (classified["advisor_match"] or {}).get("email"),
        "client_email":         (classified["client"] or {}).get("email"),
        "transcript_ready":     firefly["transcript_ready"],
        "would_skip_reason":    classified["skip_reason"],
    })

    return {
        "fireflies_meeting_id": fireflies_id,
        "title":                firefly["title"],
        "date":                 firefly["date"],
        "duration_minutes":     firefly["duration_minutes"],
        "meeting_link":         firefly["meeting_link"],
        "transcript_ready":     firefly["transcript_ready"],
        "transcript_length":    len(firefly["transcript_text"]),
        "non_bot_attendees":    classified["non_bot"],
        "advisor_match":        classified["advisor_match"],
        "client":               classified["client"],
        "existing_client":      existing_client,    # {id,email,name} or None
        "already_ingested_meeting_id": already_ingested_meeting_id,
        "extraction_exists":    extraction_exists,
        "would_skip_reason":    classified["skip_reason"]
                                or (None if firefly["transcript_ready"]
                                    else "Transcript is not ready yet — try again later."),
    }


@router.post("", status_code=status.HTTP_200_OK)
async def ingest_meeting(
    req: IngestRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    """Atomic ingest. Re-fetches Fireflies, classifies, calls the SP,
    then publishes the meeting.transcribed event for the extraction worker
    (same topic + payload shape as the live Fireflies webhook)."""
    # Keep only agents we recognise; empty list → worker runs ALL agents.
    requested_agents = [a for a in (req.agents_to_use or []) if a in _VALID_AGENT_NAMES]

    logger.info("ingest_requested", extra={
        "input": req.fireflies_url, "requested_by": str(team_user_id),
        "has_idempotency_key": bool(req.idempotency_key),
        "agents_to_use": requested_agents,
        "agents_dropped": [a for a in (req.agents_to_use or []) if a not in _VALID_AGENT_NAMES],
    })

    client = FireflyClient(settings.firefly_api_key)
    try:
        fireflies_id = await _resolve_to_firefly_id(req.fireflies_url, client)
    except ValueError as exc:
        logger.info("ingest_bad_input", extra={"input": req.fireflies_url, "error": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        logger.info("ingest_not_found", extra={"input": req.fireflies_url, "error": str(exc)})
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("firefly_resolve_failed", extra={"input": req.fireflies_url})
        raise HTTPException(status_code=502, detail=f"Fireflies API error: {exc}")

    try:
        firefly = await client.fetch_for_ingest(fireflies_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("firefly_fetch_failed", extra={"fireflies_id": fireflies_id})
        raise HTTPException(status_code=502, detail=f"Fireflies API error: {exc}")

    if not firefly["transcript_ready"]:
        logger.info("ingest_transcript_not_ready", extra={"fireflies_meeting_id": fireflies_id})
        raise HTTPException(
            status_code=425,
            detail="Transcript is not ready yet — try again later.",
        )

    classified = await _classify_attendees(firefly["attendees"])
    if classified["skip_reason"]:
        logger.info("ingest_classification_rejected", extra={
            "fireflies_meeting_id": fireflies_id,
            "skip_reason":          classified["skip_reason"],
            "attendee_emails":      [a["email"] for a in classified["non_bot"]],
        })
        raise HTTPException(status_code=422, detail=classified["skip_reason"])

    advisor = classified["advisor_match"]
    client_attendee = classified["client"]

    try:
        result = await proc_ingest_meeting_from_fireflies(
            fireflies_meeting_id=fireflies_id,
            meeting_url=firefly["meeting_link"] or None,
            title=firefly["title"] or f"Meeting {fireflies_id[-6:]}",
            start_time=firefly["date"],
            duration_minutes=firefly["duration_minutes"] or 60,
            advisor_email=advisor["email"],
            client_email=client_attendee["email"],
            client_display_name=client_attendee.get("displayName") or None,
            transcript_text=firefly["transcript_text"],
            actor_email=ACTOR_EMAIL,
            idempotency_key=req.idempotency_key,
        )
    except ValueError as exc:
        logger.warning("ingest_sp_rejected", extra={
            "fireflies_meeting_id": fireflies_id,
            "advisor_email":        advisor["email"],
            "client_email":         client_attendee["email"],
            "error":                str(exc),
        })
        raise HTTPException(status_code=422, detail=str(exc))

    was_replay = bool(result.get("was_replay"))
    meeting_id = result.get("meeting_id")

    # On replay, re-publish the event ONLY when no extraction landed yet —
    # this lets a previously-failed CRM-AI call retry without duplicating
    # any DB rows. If extraction already succeeded, do nothing.
    extraction_exists = False
    if was_replay and meeting_id:
        async with get_pool().acquire() as conn:
            extraction_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM extractions WHERE meeting_id = $1::uuid)",
                str(meeting_id),
            )

    should_publish = (not was_replay) or (was_replay and not extraction_exists)

    if should_publish:
        # Same topic + payload shape as the live Fireflies webhook so the
        # existing transcript_processor consumer handles ingested meetings
        # identically. Keys consumed by the worker:
        #   firefly_meeting_id, meeting_id, client_id, agenda,
        #   agents_to_use, transcript_text.
        await publish_event("meeting.transcribed", {
            "firefly_meeting_id": fireflies_id,
            "title":              firefly["title"] or "",
            "meet_url":           firefly["meeting_link"] or "",
            "transcript_url":     "",
            "duration_seconds":   int((firefly["duration_minutes"] or 0) * 60),
            "transcript_path":    "",
            "transcript_text":    firefly["transcript_text"],
            "meeting_id":         str(meeting_id),
            "client_id":          str(result.get("client_id") or ""),
            "agenda":             "",
            "agents_to_use":      requested_agents,
            "timestamp":          datetime.now(timezone.utc).isoformat(),
            "source":             "manual_ingest",
        })
        logger.info("ingest_transcript_event_published", extra={
            "meeting_id":           str(meeting_id),
            "fireflies_meeting_id": fireflies_id,
            "was_replay":           was_replay,
            "reason":               "fresh_ingest" if not was_replay
                                    else "replay_no_extraction",
        })
    else:
        logger.info("ingest_replay_skipped_event", extra={
            "meeting_id":           str(meeting_id),
            "fireflies_meeting_id": fireflies_id,
            "reason":               "extraction_already_exists",
        })

    logger.info("meeting_ingested", extra={
        "meeting_id":           str(meeting_id),
        "fireflies_meeting_id": fireflies_id,
        "advisor_email":        advisor["email"],
        "client_email":         client_attendee["email"],
        "was_new_client":       bool(result.get("was_new_client")),
        "was_replay":           was_replay,
        "duration_minutes":     firefly["duration_minutes"],
        "transcript_chars":     len(firefly["transcript_text"]),
        "ingested_by":          str(team_user_id),
    })

    return {
        "meeting_id":      str(meeting_id),
        "advisor_id":      result.get("advisor_id"),
        "adviser_user_id": result.get("adviser_user_id"),
        "client_id":       result.get("client_id"),
        "client_user_id":  result.get("client_user_id"),
        "advisor_name":    advisor.get("full_name") or advisor["email"],
        "client_name":     client_attendee.get("displayName") or client_attendee["email"],
        "was_new_client":  bool(result.get("was_new_client")),
        "was_replay":      was_replay,
    }
