from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel


class ChannelType(str, Enum):
    SMS = "sms"
    EMAIL = "email"


class UserType(str, Enum):
    CLIENT = "client"
    ADVISOR = "advisor"
    TEAM = "team"


class OTPRequestedEvent(BaseModel):
    """Consumed from auth.otp.requested — validated before processing."""
    topic: Literal["auth.otp.requested"]
    userId: str
    channel: ChannelType
    target: str
    userType: UserType
    requestedAt: datetime
