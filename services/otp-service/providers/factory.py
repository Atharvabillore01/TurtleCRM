from providers.base import OTPProvider
from providers.mock import MockProvider
from circuit_breaker import CircuitBreaker
from config import settings

_instance: OTPProvider | None = None
_circuit: CircuitBreaker | None = None


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


def get_circuit_breaker() -> CircuitBreaker:
    global _circuit
    if _circuit is None:
        _circuit = CircuitBreaker(failure_threshold=5, recovery_timeout=60)
    return _circuit
