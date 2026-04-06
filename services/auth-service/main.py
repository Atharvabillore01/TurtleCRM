import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from config import settings
from redis_client import close_redis
from eventbus import disconnect
from routes.client import router as client_router
from routes.advisor import router as advisor_router
from routes.oauth import router as oauth_router
from routes.refresh import router as refresh_router

logging.basicConfig(level=logging.DEBUG if settings.node_env != "production" else logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[auth-service] starting up")
    yield
    logger.info("[auth-service] shutting down")
    await asyncio.gather(disconnect(), close_redis(), return_exceptions=True)


app = FastAPI(title="auth-service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.client_app_url, settings.advisor_app_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
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
