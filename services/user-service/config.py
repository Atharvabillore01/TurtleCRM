from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    node_env: str = "development"
    user_service_port: int = 4002

    database_url: str = "postgresql+asyncpg://turtle:changeme@localhost:5432/turtle_corporate"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    crm_ai_service_url: str = "http://localhost:5000"


settings = Settings()

# SQLAlchemy requires the asyncpg driver prefix
def get_db_url() -> str:
    url = settings.database_url
    # Convert standard postgres:// or postgresql:// to asyncpg variant
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    # Strip SSL params from URL — pass them via connect_args instead
    if "?" in url:
        url = url.split("?")[0]
    return url
