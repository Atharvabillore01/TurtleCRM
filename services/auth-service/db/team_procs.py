"""
Internal team proc wrappers — thin wrappers around deployed Postgres SPs.

`proc_is_internal_user_allowed` still uses a stub allowlist (we haven't built
an admission-policy table yet). Everything else delegates to the real SP via
call_function.
"""

import json
import logging
from db.proc_caller import register_proc, call_proc, call_function, ProcResult
from db.pool import get_pool

logger = logging.getLogger(__name__)


# ── Admission policy (DB-backed via application_config) ───────────────────────
#
# Replaces the previous hardcoded `_ALLOWED_EMAILS` set. The list of permitted
# Google login domains is now stored in:
#     application_config.config_key = 'oauth.allowed_email_domains'
# (comma-separated). Ops can add/remove domains via a single UPDATE without
# redeploying auth-service.

async def _fn_is_internal_user_allowed(email: str) -> ProcResult:
    """
    Membership gate: an internal Google OAuth login is allowed iff a row
    already exists in `team_users` with this email AND `is_active = TRUE`.

    Access is admin-controlled — to grant access, INSERT the row first.
    To revoke, set `is_active = FALSE`. Domain-based allowlisting is no
    longer consulted; the old `oauth.allowed_email_domains` config row
    is dead weight (safe to empty or delete).
    """
    if not email or "@" not in email:
        return ProcResult(result=False)

    norm_email = email.strip().lower()

    async with get_pool().acquire() as conn:
        exists = await conn.fetchval(
            """
            SELECT EXISTS(
                SELECT 1 FROM team_users
                 WHERE lower(email) = $1
                   AND is_active = TRUE
            )
            """,
            norm_email,
        )

    logger.debug(
        "[db] fn_is_internal_user_allowed",
        extra={"email": norm_email, "allowed": bool(exists),
               "gate": "team_users.email + is_active"},
    )
    return ProcResult(result=bool(exists))


# ── Registration ──────────────────────────────────────────────────────────────

def register_team_mocks() -> None:
    register_proc("fn_is_internal_user_allowed", _fn_is_internal_user_allowed)


# ── Public proc calls ─────────────────────────────────────────────────────────

async def proc_is_internal_user_allowed(email: str) -> bool:
    res = await call_proc("fn_is_internal_user_allowed", email)
    if not res.ok:
        raise RuntimeError(f"fn_is_internal_user_allowed failed [{res.errornumber}]: {res.errormessage}")
    return bool(res.result)


async def proc_create_team_user_via_oauth(
    *,
    provider: str,
    provider_user_id: str,
    email: str,
    display_name: str | None,
    request_ip: str | None = None,
) -> dict:
    """
    Resolve (or provision) a team_user from a verified OAuth identity.
    Wraps the deployed sp_create_team_user_via_oauth FUNCTION.

    Returns a dict shaped like:
        { user_id, role_id, role_code, role_name, name, email, is_first_login }

    Raises RuntimeError if the SP returns an error envelope.
    """
    res = await call_function(
        "sp_create_team_user_via_oauth",
        provider, provider_user_id, email, display_name, request_ip,
    )
    if not res.ok:
        raise RuntimeError(
            f"sp_create_team_user_via_oauth failed [{res.errornumber}]: {res.errormessage}"
        )
    return res.result  # JSONB → dict


async def proc_record_auth_event(
    *,
    event_type: str,
    segment: str,                           # 'client' | 'adviser' | 'team' | 'system'
    user_id: str | None = None,             # NULL when segment='system'
    payload: dict | None = None,
    correlation_id: str | None = None,
) -> dict | None:
    """
    Append an auth audit row to `domain_events` via sp_record_auth_event.

    BEST-EFFORT: audit failure must NEVER break the calling auth flow. Errors
    are logged and swallowed — the caller's business logic continues.

    Use for: auth.login.success, auth.login.failure, auth.otp.requested,
    auth.otp.verified, auth.otp.failed, auth.token.refreshed,
    auth.token.revoked, auth.password.changed, auth.account.locked,
    auth.user.created, etc.
    """
    try:
        res = await call_function(
            "sp_record_auth_event",
            event_type,
            segment,
            user_id,
            json.dumps(payload or {}),
            correlation_id,
        )
        if not res.ok:
            logger.warning(
                "sp_record_auth_event_failed",
                extra={
                    "event_type": event_type,
                    "segment": segment,
                    "errornumber": res.errornumber,
                    "errormessage": res.errormessage,
                },
            )
            return None
        return res.result
    except Exception as exc:
        # Don't propagate — audit write failure must not break the auth flow.
        logger.warning(
            "sp_record_auth_event_raised",
            extra={"event_type": event_type, "segment": segment, "error": str(exc)},
        )
        return None
