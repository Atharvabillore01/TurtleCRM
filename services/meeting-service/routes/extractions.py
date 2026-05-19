from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from db.meeting_procs import (
    proc_get_extraction,
    proc_list_extractions,
    proc_validate_extraction,
)
from logger import get_logger

router = APIRouter(prefix="/api/extractions", tags=["extractions"])
logger = get_logger("meeting-service")


@router.get("/")
async def list_extractions(validated: Optional[bool] = None):
    rows = await proc_list_extractions(validated=validated)
    return [asdict(r) for r in rows]


@router.get("/{extraction_id}")
async def get_extraction(extraction_id: str):
    try:
        row = await proc_get_extraction(extraction_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return asdict(row)


class FieldChange(BaseModel):
    field_id: int
    new_value: object


class ValidateExtractionRequest(BaseModel):
    validated_by: str
    validation_notes: Optional[str] = None
    changes: list[FieldChange] = []


@router.post("/{extraction_id}/validate", status_code=status.HTTP_200_OK)
async def validate_extraction(extraction_id: str, req: ValidateExtractionRequest):
    try:
        await proc_validate_extraction(
            extraction_id=extraction_id,
            validated_by=req.validated_by,
            validation_notes=req.validation_notes,
            changes=[c.model_dump() for c in req.changes],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    logger.info("extraction_validated", extra={"extraction_id": extraction_id, "validated_by": req.validated_by})
    return {"extraction_id": extraction_id, "validated": True}
