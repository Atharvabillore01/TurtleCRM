"""
Internal team proc stubs — registered into the shared proc_caller at startup.
Replace handler bodies when real stored procs are ready.
"""

import logging
from db.proc_caller import register_proc, call_proc, ProcResult

logger = logging.getLogger(__name__)

# ── Stub allowlist (replace with real DB proc) ────────────────────────────────

_ALLOWED_EMAILS: set[str] = {"atharvabillore007@gmail.com", "atharvabillore001@gmail.com"}


async def _fn_is_internal_user_allowed(email: str) -> ProcResult:
    allowed = email.lower() in _ALLOWED_EMAILS
    logger.debug("[db] fn_is_internal_user_allowed", extra={"email": email, "allowed": allowed})
    return ProcResult(result=allowed)


# ── Registration ──────────────────────────────────────────────────────────────

def register_team_mocks() -> None:
    register_proc("fn_is_internal_user_allowed", _fn_is_internal_user_allowed)


# ── Public proc call ──────────────────────────────────────────────────────────

async def proc_is_internal_user_allowed(email: str) -> bool:
    res = await call_proc("fn_is_internal_user_allowed", email)
    if not res.ok:
        raise RuntimeError(f"fn_is_internal_user_allowed failed [{res.errornumber}]: {res.errormessage}")
    return bool(res.result)
