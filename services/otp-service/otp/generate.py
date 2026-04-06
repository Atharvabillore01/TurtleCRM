import secrets

import bcrypt

from config import settings


def generate_otp() -> tuple[str, str]:
    """Returns (plain_otp, bcrypt_hash)."""
    length = settings.otp_length
    otp = str(secrets.randbelow(10 ** length)).zfill(length)
    hash_ = bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()
    return otp, hash_
