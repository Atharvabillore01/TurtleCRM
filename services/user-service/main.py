import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

from config import settings
from database import get_db, create_tables
from models import User, Advisor

logging.basicConfig(level=logging.DEBUG if settings.node_env != "production" else logging.INFO)
logger = logging.getLogger(__name__)
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    logger.info("[user-service] tables ready")
    yield


app = FastAPI(title="user-service", lifespan=lifespan)


# ─── Users (clients) ──────────────────────────────────────────────────────────

class CreateUserBody(BaseModel):
    phone: str | None = None
    email: str | None = None


@app.post("/users", status_code=201)
async def create_user(body: CreateUserBody, db: AsyncSession = Depends(get_db)):
    if not body.phone and not body.email:
        raise HTTPException(400, "phone or email is required")
    user = User(phone=body.phone, email=body.email)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "phone": user.phone, "email": user.email}


@app.get("/users/{user_id}")
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
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
async def create_advisor(body: CreateAdvisorBody, db: AsyncSession = Depends(get_db)):
    hash_ = pwd_ctx.hash(body.password)
    advisor = Advisor(
        username=body.username,
        email=body.email,
        password_hash=hash_,
        otp_channel=body.otp_channel,
        otp_target=body.otp_target,
    )
    db.add(advisor)
    await db.commit()
    await db.refresh(advisor)
    return {"id": advisor.id, "username": advisor.username, "email": advisor.email}


@app.get("/advisors/by-username/{username}")
async def get_advisor_by_username(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Advisor).where(Advisor.username == username))
    advisor = result.scalar_one_or_none()
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
