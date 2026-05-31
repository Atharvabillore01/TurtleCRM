from dataclasses import asdict
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_dep import get_current_team_user
from db.meeting_procs import (
    proc_get_extraction,
    proc_list_extractions,
    proc_patch_extraction_fields,
    proc_validate_extraction,
)
from logger import get_logger

router = APIRouter(prefix="/api/extractions", tags=["extractions"])
logger = get_logger("meeting-service")


@router.get("/")
async def list_extractions(validated: Optional[bool] = None):
    rows = await proc_list_extractions(validated=validated)
    # Rows from the real SP arrive as dicts; legacy stub rows are dataclasses.
    return [r if isinstance(r, dict) else asdict(r) for r in rows]


@router.get("/{extraction_id}")
async def get_extraction(extraction_id: str):
    try:
        row = await proc_get_extraction(extraction_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return row if isinstance(row, dict) else asdict(row)


# ── Per-field reviewer edits ──────────────────────────────────────────────────
# AI Validation page's "Save" handler calls this with one or more field edits.
# `changed_by` is JWT-derived (never from the body). `expected_version` is the
# version the reviewer saw on load — server returns 1015 + the new version if a
# concurrent reviewer raced past us.

class FieldEdit(BaseModel):
    field_id: str
    value: Any = None
    confidence: Optional[float] = None
    confidence_level: Optional[str] = None
    source: Optional[str] = None
    reason: Optional[str] = None


class PatchExtractionRequest(BaseModel):
    expected_version: int
    updates: list[FieldEdit]


@router.post("/{extraction_id}/fields", status_code=status.HTTP_200_OK)
async def patch_extraction_fields(
    extraction_id: str,
    req: PatchExtractionRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    """Apply a reviewer's per-field edits with audit trail + version bump."""
    if not req.updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one edit is required.",
        )
    try:
        result = await proc_patch_extraction_fields(
            extraction_id=extraction_id,
            expected_version=req.expected_version,
            changed_by=str(team_user_id),
            updates=[u.model_dump(exclude_none=True) for u in req.updates],
        )
    except PermissionError as exc:
        # 1018 → extraction is validated, edits blocked
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail=str(exc))
    except ValueError as exc:
        # 1015 → version mismatch comes back as ValueError
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    logger.info("extraction_patched", extra={
        "extraction_id": extraction_id,
        "changed_by": str(team_user_id),
        "edits": len(req.updates),
    })
    return result


# ── Approve / validate the whole extraction ──────────────────────────────────

class ValidateExtractionRequest(BaseModel):
    """Phase 2: `reason` is required (≥5 chars). `notes` is optional extra context."""
    reason: str
    notes: Optional[str] = None


@router.post("/{extraction_id}/validate", status_code=status.HTTP_200_OK)
async def validate_extraction(
    extraction_id: str,
    req: ValidateExtractionRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    """Mark the extraction as reviewed and authoritative. `validated_by` is JWT-derived.
    Writes an append-only row in extraction_validation_audit."""
    try:
        result = await proc_validate_extraction(
            extraction_id=extraction_id,
            validated_by=str(team_user_id),
            reason=req.reason,
            notes=req.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    logger.info("extraction_validated", extra={
        "extraction_id": extraction_id,
        "validated_by":  str(team_user_id),
    })
    return result


# ── Unvalidate (revert) the whole extraction ─────────────────────────────────

class UnvalidateExtractionRequest(BaseModel):
    """Phase 2: reverting a validated extraction REQUIRES a reason (≥5 chars)."""
    reason: str
    notes: Optional[str] = None


@router.post("/{extraction_id}/unvalidate", status_code=status.HTTP_200_OK)
async def unvalidate_extraction(
    extraction_id: str,
    req: UnvalidateExtractionRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    """Revert a previously-validated extraction back to editable state.
    Writes an append-only row in extraction_validation_audit."""
    from db.meeting_procs import proc_unvalidate_extraction

    try:
        result = await proc_unvalidate_extraction(
            extraction_id=extraction_id,
            unvalidated_by=str(team_user_id),
            reason=req.reason,
            notes=req.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    logger.info("extraction_unvalidated", extra={
        "extraction_id":  extraction_id,
        "unvalidated_by": str(team_user_id),
        "audit_id":       (result or {}).get("audit_id"),
    })
    return result


# ── Validation history feed (banner data) ────────────────────────────────────

@router.get("/{extraction_id}/validation-history", status_code=status.HTTP_200_OK)
async def get_validation_history(
    extraction_id: str,
    limit: int = 10,
    _team_user_id: UUID = Depends(get_current_team_user),
):
    """Append-only audit log of validate / unvalidate transitions, newest-first."""
    from db.meeting_procs import proc_validation_history
    return await proc_validation_history(extraction_id, limit=limit)
