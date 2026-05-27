# Dockerfile replaces this with shared/logger/logger.py at build time.
# For local dev outside Docker: copy shared/logger/logger.py to this directory.
try:
    from shared.logger.logger import get_logger  # noqa: F401
except ImportError:
    import logging

    def get_logger(name: str):  # type: ignore[misc]
        return logging.getLogger(name)
