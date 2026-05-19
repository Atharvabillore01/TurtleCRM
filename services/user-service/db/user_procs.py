"""
User-service proc stubs — registered into the shared proc_caller at startup.

When the backend team delivers a real proc, replace only the handler body.
Handlers must return ProcResult; the public wrappers unpack .result for callers.
"""

import uuid
import logging
from dataclasses import dataclass
from typing import Optional

from db.proc_caller import register_proc, call_proc, ProcResult

logger = logging.getLogger(__name__)


# ── Domain models ─────────────────────────────────────────────────────────────

@dataclass
class UserRow:
    id: str
    phone: Optional[str]
    email: Optional[str]
    is_active: bool = True


@dataclass
class AdvisorRow:
    id: str
    username: str
    email: str
    password_hash: str
    role: str
    otp_channel: str
    otp_target: str
    is_active: bool = True


@dataclass
class TranscriptRow:
    id: str
    client_id: str
    extracted_json: dict


# ── In-memory store (stub only) ───────────────────────────────────────────────

_users: dict[str, UserRow] = {}
_advisors_by_id: dict[str, AdvisorRow] = {}
_advisors_by_username: dict[str, AdvisorRow] = {}
_advisors_by_email: dict[str, AdvisorRow] = {}


# ── Proc handlers ─────────────────────────────────────────────────────────────

async def _sp_create_user(phone: Optional[str], email: Optional[str]) -> ProcResult:
    row = UserRow(id=str(uuid.uuid4()), phone=phone, email=email)
    _users[row.id] = row
    logger.info("[db] sp_create_user", extra={"user_id": row.id})
    return ProcResult(result=row)


async def _sp_get_user(user_id: str) -> ProcResult:
    row = _users.get(user_id)
    logger.debug("[db] sp_get_user", extra={"user_id": user_id, "found": row is not None})
    return ProcResult(result=row)


async def _sp_create_advisor(
    username: str,
    email: str,
    password_hash: str,
    otp_channel: str,
    otp_target: str,
) -> ProcResult:
    if username in _advisors_by_username or email in _advisors_by_email:
        return ProcResult(errornumber=409, errormessage="username_or_email_exists", nextAction="change_credentials")
    row = AdvisorRow(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        password_hash=password_hash,
        role="advisor",
        otp_channel=otp_channel,
        otp_target=otp_target,
    )
    _advisors_by_id[row.id] = row
    _advisors_by_username[username] = row
    _advisors_by_email[email] = row
    logger.info("[db] sp_create_advisor", extra={"advisor_id": row.id, "username": username})
    return ProcResult(result=row)


async def _sp_get_advisor_by_username(username: str) -> ProcResult:
    row = _advisors_by_username.get(username)
    logger.debug("[db] sp_get_advisor_by_username", extra={"username": username, "found": row is not None})
    return ProcResult(result=row)


async def _sp_save_transcript_extraction(
    client_id: str,
    raw_transcript: str,
    extracted_json: dict,
) -> ProcResult:
    row = TranscriptRow(id=str(uuid.uuid4()), client_id=client_id, extracted_json=extracted_json)
    logger.info("[db] sp_save_transcript_extraction", extra={"record_id": row.id, "client_id": client_id})
    return ProcResult(result=row)


# ── Registration ──────────────────────────────────────────────────────────────

def register_user_mocks() -> None:
    """Call once at service startup (inside lifespan)."""
    register_proc("sp_create_user",                _sp_create_user)
    register_proc("sp_get_user",                   _sp_get_user)
    register_proc("sp_create_advisor",             _sp_create_advisor)
    register_proc("sp_get_advisor_by_username",    _sp_get_advisor_by_username)
    register_proc("sp_save_transcript_extraction", _sp_save_transcript_extraction)


# ── Public proc calls ─────────────────────────────────────────────────────────

async def proc_create_user(phone: Optional[str], email: Optional[str]) -> UserRow:
    res = await call_proc("sp_create_user", phone, email)
    if not res.ok:
        raise RuntimeError(f"sp_create_user failed [{res.errornumber}]: {res.errormessage}")
    return res.result  # UserRow


async def proc_get_user(user_id: str) -> Optional[UserRow]:
    res = await call_proc("sp_get_user", user_id)
    if not res.ok:
        raise RuntimeError(f"sp_get_user failed [{res.errornumber}]: {res.errormessage}")
    return res.result  # UserRow | None


async def proc_create_advisor(
    username: str,
    email: str,
    password_hash: str,
    otp_channel: str,
    otp_target: str,
) -> AdvisorRow:
    res = await call_proc("sp_create_advisor", username, email, password_hash, otp_channel, otp_target)
    if not res.ok:
        if res.errornumber == 409:
            raise ValueError(res.errormessage)
        raise RuntimeError(f"sp_create_advisor failed [{res.errornumber}]: {res.errormessage}")
    return res.result  # AdvisorRow


async def proc_get_advisor_by_username(username: str) -> Optional[AdvisorRow]:
    res = await call_proc("sp_get_advisor_by_username", username)
    if not res.ok:
        raise RuntimeError(f"sp_get_advisor_by_username failed [{res.errornumber}]: {res.errormessage}")
    return res.result  # AdvisorRow | None


async def proc_save_transcript_extraction(
    client_id: str,
    raw_transcript: str,
    extracted_json: dict,
) -> TranscriptRow:
    res = await call_proc("sp_save_transcript_extraction", client_id, raw_transcript, extracted_json)
    if not res.ok:
        raise RuntimeError(f"sp_save_transcript_extraction failed [{res.errornumber}]: {res.errormessage}")
    return res.result  # TranscriptRow
