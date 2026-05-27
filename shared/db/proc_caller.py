"""
Generic stored-procedure caller.

All DB access goes through registered procedure handlers.
When the backend team delivers a real proc, replace the registered handler body —
no call-site changes needed anywhere.

Usage
-----
# 1. Register a proc handler once at service startup (in lifespan):
from shared.db.proc_caller import register_proc

register_proc("sp_create_user", _create_user)

# 2. Call anywhere:
result = await call_proc("sp_create_user", phone, email)
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Callable, Awaitable, Optional

from .pool import get_pool

logger = logging.getLogger(__name__)

# proc registry: proc_name → async callable
_registry: dict[str, Callable[..., Awaitable[Any]]] = {}


@dataclass
class ProcResult:
    """
    Standard envelope returned by every proc call.

    result      → raw value from the proc; map this to your model
    errormessage → human-readable error description
    errornumber  → numeric error code (None = success)
    nextAction   → hint for the caller ("retry", "redirect", etc.)
    """
    result: Any = None
    errormessage: Optional[str] = None
    errornumber: Optional[int] = None
    nextAction: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.errornumber is None or self.errornumber == 0


def register_proc(proc_name: str, fn: Callable[..., Awaitable[Any]]) -> None:
    """Register a handler for a proc name."""
    _registry[proc_name] = fn
    logger.debug(f"[proc_caller] registered → {proc_name}")


async def call_proc(proc_name: str, *args: Any, **kwargs: Any) -> ProcResult:
    """
    Call a registered proc handler by name.
    Always returns a ProcResult — never raises for business errors.
    Raises NotImplementedError if no handler is registered.
    """
    fn = _registry.get(proc_name)
    if fn is None:
        raise NotImplementedError(
            f"[proc_caller] no handler registered for '{proc_name}'. "
            f"Call register_proc('{proc_name}', your_fn) at startup."
        )
    logger.debug(f"[proc_caller] call → {proc_name}{args}")
    return await fn(*args, **kwargs)


async def call_function(fn_name: str, *args: Any) -> ProcResult:
    """
    Call a deployed Postgres FUNCTION that conforms to the BACKEND_PROCS.md
    4-column envelope: (result JSONB, errormessage TEXT, errornumber INTEGER,
    nextaction TEXT). Returns a ProcResult.

    Usage:
        res = await call_function("sp_schedule_meeting",
                                  title, description, ..., metadata)
        if not res.ok:
            raise HTTPException(...)
        meeting_id = res.result["meeting_id"]

    For positional args, the SQL is `SELECT * FROM <fn_name>($1, $2, ...)`.
    JSON-able dicts/lists are auto-converted to jsonb. UUIDs and dates pass
    through asyncpg natively.
    """
    pool = get_pool()
    placeholders = ", ".join(f"${i + 1}" for i in range(len(args)))
    sql = f'SELECT result, errormessage, errornumber, nextaction FROM {fn_name}({placeholders})'

    encoded_args = []
    for a in args:
        # asyncpg encodes Python lists natively for typed SQL arrays (uuid[],
        # text[], etc.). Only jsonb needs a stringified payload — and dict is
        # the only Python type that maps unambiguously to jsonb here. If a
        # caller needs to pass a JSON array as jsonb, they should json.dumps
        # it themselves before calling.
        if isinstance(a, dict):
            encoded_args.append(json.dumps(a))
        else:
            encoded_args.append(a)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *encoded_args)

    if row is None:
        # Function returned no row at all — surface as a server error.
        return ProcResult(
            errormessage=f"{fn_name} returned no row",
            errornumber=5000,
        )

    raw_result = row["result"]
    if isinstance(raw_result, (str, bytes)):
        try:
            raw_result = json.loads(raw_result) if raw_result else None
        except (ValueError, TypeError):
            pass  # leave as-is if it isn't JSON

    return ProcResult(
        result=raw_result,
        errormessage=row["errormessage"],
        errornumber=row["errornumber"],
        nextAction=row["nextaction"],
    )
