from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    node_env: str = "development"
    notification_service_port: int = 4003
    rabbitmq_url: str = "amqp://turtle:changeme@localhost:5672"
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@turtlecorporate.com"
    sendgrid_from_name: str = "Turtle Corporate"


settings = Settings()
