from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ChannelType(str, Enum):
    SMS = "sms"
    EMAIL = "email"


class UserType(str, Enum):
    CLIENT = "client"
    ADVISOR = "advisor"
    TEAM = "team"


class OTPRequestedPayload(BaseModel):
    channel: ChannelType
    target: str
    userId: str
    userType: UserType
    requestedAt: datetime


class OTPRequestedEvent(BaseModel):
    topic: Literal["auth.otp.requested"] = "auth.otp.requested"
    payload: OTPRequestedPayload


class OTPVerifiedEvent(BaseModel):
    topic: Literal["auth.otp.verified"] = "auth.otp.verified"
    userId: str
    channel: ChannelType
    userType: UserType
    verifiedAt: datetime


class LoginSuccessEvent(BaseModel):
    topic: Literal["auth.login.success"] = "auth.login.success"
    userId: str
    userType: UserType
    authMethod: Literal["otp", "password", "oauth"]
    sessionId: Optional[str] = None
    ip: Optional[str] = None
    loggedInAt: datetime


class LoginFailedEvent(BaseModel):
    topic: Literal["auth.login.failed"] = "auth.login.failed"
    userId: Optional[str] = None
    userType: UserType
    authMethod: str
    reason: str
    ip: Optional[str] = None
    failedAt: datetime
