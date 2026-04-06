import secrets
from passlib.context import CryptContext
from config import settings

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def generate_otp() -> tuple[str, str]:
    """Returns (plain_otp, bcrypt_hash)."""
    length = settings.otp_length
    max_val = 10 ** length
    otp = str(secrets.randbelow(max_val)).zfill(length)
    hash_ = pwd_ctx.hash(otp)
    return otp, hash_
