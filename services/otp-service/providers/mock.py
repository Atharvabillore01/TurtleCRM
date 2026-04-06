import logging
from providers.base import OTPProvider

logger = logging.getLogger(__name__)


class MockProvider(OTPProvider):
    async def send_sms(self, phone: str, otp: str) -> None:
        logger.info(f"[mock] SMS → {phone}  OTP: {otp}")
        print(f"[mock] SMS → {phone}  OTP: {otp}")

    async def send_email(self, email: str, otp: str) -> None:
        logger.info(f"[mock] Email → {email}  OTP: {otp}")
        print(f"[mock] Email → {email}  OTP: {otp}")
