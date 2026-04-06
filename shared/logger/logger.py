"""
Shared structured logger for all Turtle services.

Usage:
    from logger import get_logger
    logger = get_logger("auth-service")
    logger.info("OTP requested", extra={"channel": "sms", "destination": "+1****7890"})

Each service gets:
  - JSON-formatted output to stdout
  - Rotating file at logs/<service>.log          (10 MB × 5 backups, all levels)
  - Rotating file at logs/<service>.error.log    (10 MB × 5 backups, ERROR+ only)
  - Combined file at logs/combined/combined.log       (50 MB × 10 backups, all services, all levels)
  - Combined file at logs/combined/combined.error.log (50 MB × 10 backups, all services, ERROR+ only)

The log directory is created next to this file at runtime.
In Docker the file is copied to /app/logger.py, so logs land in /app/logs/.
  logs/combined/ is bind-mounted to ./logs/combined on the host (shared across containers).
In local dev logs land in services/<svc>/logs/.
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any


# Standard LogRecord attributes that we never emit as extra JSON fields
_SKIP_ATTRS: frozenset[str] = frozenset({
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName",
})


class _JSONFormatter(logging.Formatter):
    """Emits each log record as a single JSON line."""

    def __init__(self, service: str) -> None:
        super().__init__()
        self._service = service

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": self._service,
            "logger": record.name,
            "message": record.getMessage(),
        }

        if record.exc_info:
            entry["exc_info"] = self.formatException(record.exc_info)

        # Merge any extra={} fields the caller attached
        for key, val in record.__dict__.items():
            if key not in _SKIP_ATTRS:
                entry[key] = val

        return json.dumps(entry, default=str)


def get_logger(service: str, *, level: str | None = None) -> logging.Logger:
    """
    Return a named logger configured for *service*.

    Calling this multiple times with the same service name is safe —
    handlers are only attached once.

    Args:
        service: Human-readable service name, used in every log line
                 and as the filename base (e.g. "auth-service").
        level:   Override log level ("DEBUG", "INFO", …).  Defaults to
                 DEBUG in development, INFO in production (reads NODE_ENV).
    """
    if level is None:
        env = os.getenv("NODE_ENV", "development")
        level = "DEBUG" if env != "production" else "INFO"

    logger = logging.getLogger(service)

    # Idempotent — skip if already configured
    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    logger.propagate = False

    formatter = _JSONFormatter(service)

    # ── stdout handler ────────────────────────────────────────────────────
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    logger.addHandler(stdout_handler)

    # ── rotating file handler ─────────────────────────────────────────────
    # Resolve log directory relative to this file so it always lands next
    # to logger.py regardless of the CWD.
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)

    file_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, f"{service}.log"),
        maxBytes=10 * 1024 * 1024,   # 10 MB per file
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    # ── error-only log for this service ──────────────────────────────────
    error_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, f"{service}.error.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)
    logger.addHandler(error_handler)

    # ── combined log (all services in one file) ───────────────────────────
    combined_dir = os.path.join(log_dir, "combined")
    os.makedirs(combined_dir, exist_ok=True)

    combined_handler = RotatingFileHandler(
        filename=os.path.join(combined_dir, "combined.log"),
        maxBytes=50 * 1024 * 1024,   # 50 MB per file
        backupCount=10,
        encoding="utf-8",
    )
    combined_handler.setFormatter(formatter)
    logger.addHandler(combined_handler)

    # ── combined error-only log (all services) ────────────────────────────
    combined_error_handler = RotatingFileHandler(
        filename=os.path.join(combined_dir, "combined.error.log"),
        maxBytes=50 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    combined_error_handler.setLevel(logging.ERROR)
    combined_error_handler.setFormatter(formatter)
    logger.addHandler(combined_error_handler)

    return logger
