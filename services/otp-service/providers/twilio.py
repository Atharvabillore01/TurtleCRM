import logging

import httpx

from config import settings
from providers.base import OTPProvider

logger = logging.getLogger(__name__)

VERIFY_BASE = "https://verify.twilio.com/v2/Services"


class TwilioVerifyProvider(OTPProvider):
    """
    Uses Twilio Verify API — Twilio generates and delivers the OTP itself.
    The `otp` param in send_* is ignored; Twilio owns the code.
    Verification must go through `verify_code()` instead of Redis.
    """

    def __init__(self) -> None:
        self.account_sid = settings.twilio_account_sid
        self.auth_token = settings.twilio_auth_token
        self.service_sid = settings.twilio_verify_service_sid
        self._auth = (self.account_sid, self.auth_token)

    async def send_sms(self, phone: str, otp: str) -> None:
        await self._create_verification(phone, "sms")

    async def send_email(self, email: str, otp: str) -> None:
        await self._create_verification(email, "email")

    async def _create_verification(self, to: str, channel: str) -> None:
        url = f"{VERIFY_BASE}/{self.service_sid}/Verifications"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                auth=self._auth,
                data={"To": to, "Channel": channel},
            )
        if resp.status_code not in (200, 201):
            logger.error(f"[twilio] send failed: {resp.status_code} {resp.text}")
            raise RuntimeError(f"Twilio Verify send failed: {resp.status_code}")
        logger.info(f"[twilio] verification sent via {channel} to {to}")

    async def verify_code(self, to: str, code: str) -> bool:
        """
        Check a code against Twilio Verify.
        Returns True if approved, False otherwise.
        """
        url = f"{VERIFY_BASE}/{self.service_sid}/VerificationCheck"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                auth=self._auth,
                data={"To": to, "Code": code},
            )
        if resp.status_code == 404:
            return False  # code expired or not found
        if resp.status_code not in (200, 201):
            logger.error(f"[twilio] verify check failed: {resp.status_code} {resp.text}")
            return False
        data = resp.json()
        return data.get("status") == "approved"
