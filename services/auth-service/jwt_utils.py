import re
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError

from config import settings


def _parse_duration_secs(s: str) -> int:
    m = re.match(r"^(\d+)([smhd])$", s)
    if not m:
        return 900
    n, unit = int(m.group(1)), m.group(2)
    return n * {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]


ACCESS_TTL = _parse_duration_secs(settings.jwt_expires_in)
REFRESH_TTL = _parse_duration_secs(settings.refresh_token_expires_in)


def sign_access_token(user_id: str, user_type: str, role: str, session_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "userType": user_type,
        "role": role,
        "sessionId": session_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ACCESS_TTL)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def verify_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def sign_refresh_token(user_id: str, session_id: str, user_type: str = "client", role: str = "client") -> tuple[str, str]:
    token_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "sessionId": session_id,
        "tokenId": token_id,
        "userType": user_type,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=REFRESH_TTL)).timestamp()),
    }
    token = jwt.encode(payload, settings.refresh_token_secret, algorithm="HS256")
    return token, token_id


def verify_refresh_token(token: str) -> dict:
    return jwt.decode(token, settings.refresh_token_secret, algorithms=["HS256"])


def refresh_token_key(user_id: str, token_id: str) -> str:
    return f"refresh:{user_id}:{token_id}"


def refresh_token_ttl() -> int:
    return REFRESH_TTL
