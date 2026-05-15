import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from config import settings
from consumer import start_consumers
from logger import get_logger

logger = get_logger("notification-service")

_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    _consumer_task = asyncio.create_task(start_consumers())
    logger.info("notification-service started", extra={"env": settings.node_env})
    yield
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
    logger.info("notification-service shut down")


app = FastAPI(title="notification-service", lifespan=lifespan)

try:
    from tracing import setup_tracing
    setup_tracing(app, "notification-service")
except ImportError:
    pass

try:
    from metrics import metrics_middleware, metrics_endpoint
    app.middleware("http")(metrics_middleware)

    @app.get("/metrics", include_in_schema=False)
    async def _metrics():
        return await metrics_endpoint()
except ImportError:
    pass


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        "http_request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "client_ip": request.client.host if request.client else "unknown",
        },
    )
    return response


@app.get("/health")
async def health():
    return {"status": "ok", "service": "notification-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.notification_service_port, reload=True)
