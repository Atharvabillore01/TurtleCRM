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

import logging
from dataclasses import dataclass
from typing import Any, Callable, Awaitable, Optional

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
        return self.errornumber is None


def register_proc(proc_name: str, fn: Callable[..., Awaitable[Any]]) -> None:
    """Register a handler for a proc name."""
    _registry[proc_name] = fn
    logger.debug(f"[proc_caller] registered → {proc_name}")


async def call_proc(proc_name: str, *args: Any) -> ProcResult:
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
    return await fn(*args)
