import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from config import settings
from consumer import start_consumers

logging.basicConfig(level=logging.DEBUG if settings.node_env != "production" else logging.INFO)
logger = logging.getLogger(__name__)

_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    _consumer_task = asyncio.create_task(start_consumers())
    logger.info("[notification-service] started")
    yield
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
    logger.info("[notification-service] shut down")


app = FastAPI(title="notification-service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "notification-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.notification_service_port, reload=True)
