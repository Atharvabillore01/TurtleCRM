from fastapi import APIRouter, HTTPException

from db.meeting_procs import proc_list_clients, proc_list_advisors
from logger import get_logger

router = APIRouter(prefix="/api", tags=["clients"])
logger = get_logger("meeting-service")


@router.get("/clients")
async def list_clients():
    try:
        return await proc_list_clients()
    except Exception as exc:
        logger.error("list_clients_error", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/advisors")
async def list_advisors():
    try:
        return await proc_list_advisors()
    except Exception as exc:
        logger.error("list_advisors_error", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc))
