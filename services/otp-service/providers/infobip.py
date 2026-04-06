import httpx

from config import settings
from providers.base import OTPProvider


class InfobipProvider(OTPProvider):
    def __init__(self) -> None:
        self.api_key = settings.infobip_api_key
        self.sender_id = settings.infobip_sender_id
        self.base_url = (settings.infobip_base_url or "https://api.infobip.com").rstrip("/")

        if not self.api_key:
            raise RuntimeError("INFOBIP_API_KEY required")
        if not self.sender_id:
            raise RuntimeError("INFOBIP_SENDER_ID required")

    async def send_sms(self, phone: str, otp: str) -> None:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.base_url}/sms/2/text/advanced",
                headers={
                    "Authorization": f"App {self.api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={
                    "messages": [
                        {
                            "from": self.sender_id,
                            "destinations": [{"to": phone}],
                            "text": f"Your Turtle Corporate OTP is: {otp}. Valid for 5 minutes. Do not share this code.",
                        }
                    ]
                },
            )

        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Infobip SMS failed: {resp.status_code} {resp.text}")

    async def send_email(self, email: str, otp: str) -> None:
        raise RuntimeError("Infobip email delivery is not configured for otp-service")
