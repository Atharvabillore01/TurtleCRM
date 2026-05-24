from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    node_env: str = "development"
    meeting_service_port: int = 4004

    rabbitmq_url: str = "amqp://turtle:changeme@localhost:5672"
    redis_url: str = "redis://localhost:6379"
    crm_ai_service_url: str = "http://localhost:5000"

    firefly_api_key: str = ""
    firefly_webhook_secret: str = ""
    firefly_bot_email: str = ""

    google_client_id: str = ""
    google_client_secret: str = ""

    # Service Account (Domain-Wide Delegation).
    # Path to the SA JSON key, mounted into the container by docker-compose.
    google_service_account_file: str = "/app/secrets/gcp-sa.json"
    # Workspace user the SA impersonates (DWD). Required for Meet link creation
    # and inviting attendees. Must be a valid Workspace user on a domain that
    # has DWD authorized for this SA.
    google_impersonate_email: str = ""

    # Calendar to create events on. "primary" when impersonating a Workspace user.
    google_calendar_id: str = "primary"
    google_calendar_timezone: str = "Asia/Kolkata"


settings = Settings()
