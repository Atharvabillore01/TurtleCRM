from providers.base import OTPProvider
from providers.mock import MockProvider
from config import settings

_instance: OTPProvider | None = None


def get_otp_provider() -> OTPProvider:
    global _instance
    if _instance is None:
        name = settings.otp_provider.lower()
        if name == "twilio":
            from providers.twilio import TwilioVerifyProvider
            _instance = TwilioVerifyProvider()
        elif name == "infobip":
            from providers.infobip import InfobipProvider
            _instance = InfobipProvider()
        elif name == "mock":
            _instance = MockProvider()
        else:
            from providers.twilio import TwilioVerifyProvider
            _instance = TwilioVerifyProvider()
    return _instance
