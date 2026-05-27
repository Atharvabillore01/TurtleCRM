from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    node_env: str = "development"
    user_service_port: int = 4002

    rabbitmq_url: str = "amqp://turtle:changeme@localhost:5672"
    redis_url: str = "redis://localhost:6379"
    crm_ai_service_url: str = "http://localhost:5000"


settings = Settings()
