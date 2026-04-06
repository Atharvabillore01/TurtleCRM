from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    node_env: str = "development"
    auth_service_port: int = 4000

    redis_url: str = "redis://localhost:6379"
    redis_password: str = "changeme"

    jwt_secret: str = "changeme_jwt_secret_min_32_chars"
    jwt_expires_in: str = "15m"
    refresh_token_secret: str = "changeme_refresh_secret_min_32_chars"
    refresh_token_expires_in: str = "7d"

    rabbitmq_url: str = "amqp://turtle:changeme@localhost:5672"

    otp_expires_in_seconds: int = 300
    otp_length: int = 6

    otp_service_url: str = "http://localhost:4001"
    user_service_url: str = "http://localhost:4002"

    client_app_url: str = "http://localhost:3000"
    advisor_app_url: str = "http://localhost:3001"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_callback_url: str = "http://localhost:4000/auth/oauth/google/callback"


settings = Settings()
