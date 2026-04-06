from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    node_env: str = "development"
    otp_service_port: int = 4001

    redis_url: str = "redis://localhost:6379"
    redis_password: str = "changeme"

    rabbitmq_url: str = "amqp://turtle:changeme@localhost:5672"

    otp_expires_in_seconds: int = 300
    otp_length: int = 6
    otp_provider: str = "twilio"

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    twilio_verify_service_sid: str = ""

    # AWS SNS
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-south-1"
    aws_sns_sender_id: str = ""

    # MSG91
    msg91_auth_key: str = ""
    msg91_sender_id: str = ""
    msg91_template_id: str = ""

    # Haptic
    haptic_api_key: str = ""
    haptic_sender_id: str = ""
    haptic_base_url: str = ""

    # Infobip
    infobip_api_key: str = ""
    infobip_sender_id: str = ""
    infobip_base_url: str = "https://api.infobip.com"


settings = Settings()
