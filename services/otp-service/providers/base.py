from abc import ABC, abstractmethod


class OTPProvider(ABC):
    @abstractmethod
    async def send_sms(self, phone: str, otp: str) -> None: ...

    @abstractmethod
    async def send_email(self, email: str, otp: str) -> None: ...
