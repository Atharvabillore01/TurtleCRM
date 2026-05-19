from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    node_env: str = "development"
    meeting_service_port: int = 4004

    rabbitmq_url: str = "amqp://turtle:changeme@localhost:5672"
    crm_ai_service_url: str = "http://localhost:5000"

    firefly_api_key: str = ""
    firefly_webhook_secret: str = ""

    # Google Calendar — path to service account JSON key file
    # OR set GOOGLE_SERVICE_ACCOUNT_JSON to the raw JSON string
    google_service_account_file: str = ""
    google_service_account_json: str = ""
    # Calendar to create events on (primary = organiser's default calendar)
    google_calendar_id: str = "primary"
    # Timezone for created events
    google_calendar_timezone: str = "Asia/Kolkata"


settings = Settings()
