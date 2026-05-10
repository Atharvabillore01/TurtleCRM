import datetime
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from eventbus import publish_event
from models import TranscriptExtraction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transcript", tags=["transcript"])


class ExtractRequest(BaseModel):
    clientId: str
    clientName: str
    transcript: str


@router.post("/extract", status_code=200)
async def extract_fields(body: ExtractRequest, db: AsyncSession = Depends(get_db)):
    logger.info("transcript_extract_requested", extra={"client_id": body.clientId})

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.crm_ai_service_url}/extract",  
                json={ # agents will be passed 
                    "transcript": body.transcript,
                    "client_id": body.clientId,
                    "client_name": body.clientName,
                },
            )
            resp.raise_for_status()
            ai_result: dict = resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("ai_service_error", extra={"status": exc.response.status_code, "client_id": body.clientId})
        raise HTTPException(502, "AI extraction service returned an error")
    except httpx.RequestError as exc:
        logger.error("ai_service_unreachable", extra={"error": str(exc), "client_id": body.clientId})
        raise HTTPException(503, "AI extraction service is unreachable")

    record = TranscriptExtraction(
        client_id=body.clientId,
        raw_transcript=body.transcript,
        extracted_json=ai_result,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    await publish_event("crm.fields.extracted", {
        "clientId": body.clientId,
        "clientName": body.clientName,
        "extractedFields": ai_result,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })

    logger.info("transcript_extracted", extra={"client_id": body.clientId, "extraction_id": record.id})
    return {"id": record.id, "extractedFields": ai_result}
