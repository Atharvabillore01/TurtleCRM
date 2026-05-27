import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from config import settings
from redis_client import close_redis
from eventbus import disconnect, _get_exchange
from routes.client import router as client_router
from routes.advisor import router as advisor_router
from routes.oauth import router as oauth_router
from routes.refresh import router as refresh_router
from logger import get_logger
from db.outbox_procs import register_outbox_mocks
from db.team_procs import register_team_mocks
from db.pool import init_pool, close_pool

logger = get_logger("auth-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    register_outbox_mocks()
    register_team_mocks()
    logger.info("auth-service starting up", extra={"env": settings.node_env})
    await init_pool(settings.database_url)
    logger.info("db pool ready")
    await _get_exchange()
    logger.info("rabbitmq publisher connected")
    yield
    logger.info("auth-service shutting down")
    await asyncio.gather(disconnect(), close_redis(), close_pool(), return_exceptions=True)


app = FastAPI(title="auth-service", lifespan=lifespan)

try:
    from tracing import setup_tracing
    setup_tracing(app, "auth-service")
except ImportError:
    pass  # opentelemetry packages not installed — tracing disabled

try:
    from metrics import metrics_middleware, metrics_endpoint
    app.middleware("http")(metrics_middleware)

    @app.get("/metrics", include_in_schema=False)
    async def _metrics():
        return await metrics_endpoint()
except ImportError:
    pass  # prometheus_client not installed

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.client_app_url, settings.advisor_app_url, settings.internal_app_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    logger.warning(
        "validation_error",
        extra={"path": request.url.path, "errors": exc.errors()},
    )
    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation failed",
            "issues": [{"path": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()],
        },
    )


app.include_router(client_router)
app.include_router(advisor_router)
app.include_router(oauth_router)
app.include_router(refresh_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auth-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.auth_service_port, reload=True)
