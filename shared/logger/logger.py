"""
Shared logger for all Turtle services.

Terminal (stdout) → colored, human-readable one-liners
Log files         → structured JSON (machine-readable, for Grafana/alerting)

Usage:
    from logger import get_logger
    logger = get_logger("auth-service")
    logger.info("OTP requested", extra={"channel": "sms", "destination": "+1****7890"})

Output (terminal):
    16:42:07  INFO  auth-service  OTP requested  channel=sms destination=+1****7890
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any


# Standard LogRecord attributes — never printed as key=value extras
_SKIP_ATTRS: frozenset[str] = frozenset({
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName",
})

# ANSI color codes
_RESET  = "\033[0m"
_BOLD   = "\033[1m"
_DIM    = "\033[2m"
_COLORS = {
    "DEBUG":    "\033[36m",   # cyan
    "INFO":     "\033[32m",   # green
    "WARNING":  "\033[33m",   # yellow
    "ERROR":    "\033[31m",   # red
    "CRITICAL": "\033[35m",   # magenta
}
_SVC_COLOR = "\033[34m"       # blue  — service name


class _PrettyFormatter(logging.Formatter):
    """
    Human-readable terminal formatter.

    Format:
        HH:MM:SS  LEVEL  service  message  key=value key=value ...
    """

    def __init__(self, service: str, use_color: bool = True) -> None:
        super().__init__()
        self._service = service
        self._color = use_color

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.now().strftime("%H:%M:%S")
        level = record.levelname
        msg = record.getMessage()

        extras = {
            k: v for k, v in record.__dict__.items()
            if k not in _SKIP_ATTRS
        }
        extras_str = "  " + "  ".join(f"{k}={v}" for k, v in extras.items()) if extras else ""

        if record.exc_info:
            extras_str += "\n" + self.formatException(record.exc_info)

        if self._color:
            lc = _COLORS.get(level, "")
            line = (
                f"{_DIM}{ts}{_RESET}  "
                f"{lc}{_BOLD}{level:<8}{_RESET}  "
                f"{_SVC_COLOR}{self._service:<20}{_RESET}  "
                f"{msg}"
                f"{_DIM}{extras_str}{_RESET}"
            )
        else:
            line = f"{ts}  {level:<8}  {self._service:<20}  {msg}{extras_str}"

        return line


class _JSONFormatter(logging.Formatter):
    """One JSON object per line — for log files consumed by Grafana/Loki."""

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
        for key, val in record.__dict__.items():
            if key not in _SKIP_ATTRS:
                entry[key] = val
        return json.dumps(entry, default=str)


def get_logger(service: str, *, level: str | None = None) -> logging.Logger:
    """
    Return a named logger for *service*.
    Safe to call multiple times — handlers are attached only once.
    """
    if level is None:
        env = os.getenv("NODE_ENV", "development")
        level = "DEBUG" if env != "production" else "INFO"

    # Silence uvicorn's access log — our HTTP middleware already logs every request
    logging.getLogger("uvicorn.access").handlers = []
    logging.getLogger("uvicorn.access").propagate = False

    logger = logging.getLogger(service)
    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    logger.propagate = False

    # ── stdout: pretty colored lines ─────────────────────────────────────
    use_color = sys.stdout.isatty() or os.getenv("FORCE_COLOR", "") == "1"
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(_PrettyFormatter(service, use_color=use_color))
    logger.addHandler(stdout_handler)

    # ── rotating file: JSON ───────────────────────────────────────────────
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)

    json_fmt = _JSONFormatter(service)

    file_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, f"{service}.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(json_fmt)
    logger.addHandler(file_handler)

    error_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, f"{service}.error.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(json_fmt)
    logger.addHandler(error_handler)

    combined_dir = os.path.join(log_dir, "combined")
    os.makedirs(combined_dir, exist_ok=True)

    combined_handler = RotatingFileHandler(
        filename=os.path.join(combined_dir, "combined.log"),
        maxBytes=50 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    combined_handler.setFormatter(json_fmt)
    logger.addHandler(combined_handler)

    combined_error_handler = RotatingFileHandler(
        filename=os.path.join(combined_dir, "combined.error.log"),
        maxBytes=50 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    combined_error_handler.setLevel(logging.ERROR)
    combined_error_handler.setFormatter(json_fmt)
    logger.addHandler(combined_error_handler)

    return logger
