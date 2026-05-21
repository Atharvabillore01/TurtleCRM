import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db.meeting_procs import register_meeting_procs
from eventbus import disconnect_publisher
from redis_client import close_redis
from logger import get_logger
from metrics import metrics_endpoint, metrics_middleware
from routes.clients import router as clients_router
from routes.extractions import router as extractions_router
from routes.meetings import router as meetings_router
from routes.webhooks import router as webhooks_router
from workers.data_persistence import run_data_persistence
from workers.summary_worker import run_summary_worker
from workers.transcript_processor import run_transcript_processor

logger = get_logger("meeting-service")

_worker_tasks: list[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    register_meeting_procs()
    logger.info("meeting_service_starting", extra={"port": settings.meeting_service_port})

    _worker_tasks.append(asyncio.create_task(run_transcript_processor(), name="transcript-processor"))
    _worker_tasks.append(asyncio.create_task(run_data_persistence(), name="data-persistence"))
    _worker_tasks.append(asyncio.create_task(run_summary_worker(), name="summary-worker"))

    yield

    for task in _worker_tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    await asyncio.gather(disconnect_publisher(), close_redis(), return_exceptions=True)
    logger.info("meeting_service_stopped")


app = FastAPI(title="meeting-service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(metrics_middleware)

app.include_router(clients_router)
app.include_router(meetings_router)
app.include_router(webhooks_router)
app.include_router(extractions_router)
app.add_route("/metrics", metrics_endpoint)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "meeting-service"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=settings.meeting_service_port, reload=False)
