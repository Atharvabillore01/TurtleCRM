import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
import bcrypt as bcrypt_lib

from config import settings
from database import get_db, create_tables
from models import User, Advisor
from logger import get_logger

logger = get_logger("user-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    logger.info("user-service started", extra={"env": settings.node_env})
    yield
    logger.info("user-service shut down")


app = FastAPI(title="user-service", lifespan=lifespan)


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


# ─── Users (clients) ──────────────────────────────────────────────────────────

class CreateUserBody(BaseModel):
    phone: str | None = None
    email: str | None = None


@app.post("/users", status_code=201)
async def create_user(body: CreateUserBody, db: AsyncSession = Depends(get_db)):
    if not body.phone and not body.email:
        logger.warning("create_user_failed", extra={"reason": "missing_phone_and_email"})
        raise HTTPException(400, "phone or email is required")
    user = User(phone=body.phone, email=body.email)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("user_created", extra={"user_id": user.id})
    return {"id": user.id, "phone": user.phone, "email": user.email}


@app.get("/users/{user_id}")
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        logger.warning("user_not_found", extra={"user_id": user_id})
        raise HTTPException(404, "User not found")
    logger.debug("user_fetched", extra={"user_id": user_id})
    return {"id": user.id, "phone": user.phone, "email": user.email, "isActive": user.is_active}


# ─── Advisors ─────────────────────────────────────────────────────────────────

class CreateAdvisorBody(BaseModel):
    username: str
    email: str
    password: str
    otp_channel: str = "email"
    otp_target: str


@app.post("/advisors", status_code=201)
async def create_advisor(body: CreateAdvisorBody, db: AsyncSession = Depends(get_db)):
    hash_ = bcrypt_lib.hashpw(body.password.encode(), bcrypt_lib.gensalt()).decode()
    advisor = Advisor(
        username=body.username,
        email=body.email,
        password_hash=hash_,
        otp_channel=body.otp_channel,
        otp_target=body.otp_target,
    )
    db.add(advisor)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Username or email already exists")
    await db.refresh(advisor)
    logger.info("advisor_created", extra={"advisor_id": advisor.id, "username": advisor.username})
    return {"id": advisor.id, "username": advisor.username, "email": advisor.email}


@app.get("/advisors/by-username/{username}")
async def get_advisor_by_username(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Advisor).where(Advisor.username == username))
    advisor = result.scalar_one_or_none()
    if not advisor:
        logger.warning("advisor_not_found", extra={"username": username})
        raise HTTPException(404, "Advisor not found")
    logger.debug("advisor_fetched", extra={"advisor_id": advisor.id, "username": username})
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
