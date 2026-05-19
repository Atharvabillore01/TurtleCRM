import asyncio
import time
from contextlib import asynccontextmanager

import bcrypt as bcrypt_lib
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from consumer import start_consumers
from eventbus import disconnect_publisher
from db.user_procs import register_user_mocks
from db.user_procs import (
    proc_create_user,
    proc_get_user,
    proc_create_advisor,
    proc_get_advisor_by_username,
)
from logger import get_logger

logger = get_logger("user-service")

_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    register_user_mocks()
    _consumer_task = asyncio.create_task(start_consumers())
    logger.info("user-service started", extra={"env": settings.node_env})
    yield
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except (asyncio.CancelledError, Exception):
            pass
    await disconnect_publisher()
    logger.info("user-service shut down")


app = FastAPI(title="user-service", lifespan=lifespan)

try:
    from metrics import metrics_middleware, metrics_endpoint
    app.middleware("http")(metrics_middleware)

    @app.get("/metrics", include_in_schema=False)
    async def _metrics():
        return await metrics_endpoint()
except ImportError:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://localhost:3000", "http://localhost:3001"],
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


# ─── Users ────────────────────────────────────────────────────────────────────

class CreateUserBody(BaseModel):
    phone: str | None = None
    email: str | None = None


@app.post("/users", status_code=201)
async def create_user(body: CreateUserBody):
    if not body.phone and not body.email:
        raise HTTPException(400, "phone or email is required")

    user = await proc_create_user(phone=body.phone, email=body.email)
    logger.info("user_created", extra={"user_id": user.id})
    return {"id": user.id, "phone": user.phone, "email": user.email}


@app.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await proc_get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return {"id": user.id, "phone": user.phone, "email": user.email, "isActive": user.is_active}


# ─── Advisors ─────────────────────────────────────────────────────────────────

class CreateAdvisorBody(BaseModel):
    username: str
    email: str
    password: str
    otp_channel: str = "email"
    otp_target: str


@app.post("/advisors", status_code=201)
async def create_advisor(body: CreateAdvisorBody):
    password_hash = bcrypt_lib.hashpw(body.password.encode(), bcrypt_lib.gensalt()).decode()
    try:
        advisor = await proc_create_advisor(
            username=body.username,
            email=body.email,
            password_hash=password_hash,
            otp_channel=body.otp_channel,
            otp_target=body.otp_target,
        )
    except ValueError:
        raise HTTPException(409, "Username or email already exists")

    logger.info("advisor_created", extra={"advisor_id": advisor.id, "username": advisor.username})
    return {"id": advisor.id, "username": advisor.username, "email": advisor.email}


@app.get("/advisors/by-username/{username}")
async def get_advisor_by_username(username: str):
    advisor = await proc_get_advisor_by_username(username)
    if not advisor:
        raise HTTPException(404, "Advisor not found")
    return {
        "id": advisor.id,
        "username": advisor.username,
        "passwordHash": advisor.password_hash,
        "role": advisor.role,
        "otpChannel": advisor.otp_channel,
        "otpTarget": advisor.otp_target,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "user-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.user_service_port, reload=True)
