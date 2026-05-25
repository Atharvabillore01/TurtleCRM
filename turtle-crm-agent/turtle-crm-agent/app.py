"""
Turtle CRM Extraction API — FastAPI
Swagger UI auto-generated at http://localhost:5000/docs
"""

import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from services.extraction_service import run_extraction, process_live_transcript_chunk

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Turtle CRM Extraction API",
    description=(
        "AI-powered CRM field extraction from financial advisory call transcripts.\n\n"
        "Supports **English**, **Hindi (Devanagari)**, and **Hinglish**.\n"
        "Extracts up to **174 CRM parameters** with confidence scores and source quotes.\n\n"
        "Called by the Node.js `crm-service` backend."
    ),
    version="1.0.0",
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ExtractContext(BaseModel):
    """Meeting-service context block. Selects which agents to run."""
    client_id: Optional[str] = Field(None, examples=["client_1"])
    client_name: Optional[str] = Field(None, examples=["Rahul Sharma"])
    agenda: Optional[str] = Field(None, examples=["Initial Consultation — Financial Planning"])
    agents_to_use: Optional[list[str]] = Field(
        None,
        examples=[["DemographicsAgent", "FinanceAgent", "GoalsAgent",
                  "ProfessionalAgent", "QualitativeAgent", "SystemResolver"]],
        description=(
            "Dispatch list. Only agents whose name appears here will run. "
            "Empty/None means run the full default pipeline."
        ),
    )


class ExtractRequest(BaseModel):
    """
    Two shapes are accepted:
    1. Legacy: { client_id, client_name?, transcript, mode?, model? }  (top-level fields)
    2. Meeting-service: { transcript, meeting_id, context: { client_id, agents_to_use, ... } }
    """
    transcript: str = Field(
        ...,
        description=(
            "Full conversation transcript. Supports English, Hindi, and Hinglish. "
            "Accepted formats:\n"
            "- Plain: `Speaker N [MM:SS]: text`\n"
            "- Markdown: `**Name** *[timestamp]*: text`"
        ),
        examples=["Speaker 1 [0:00]: Hi Rahul.\nSpeaker 2 [0:05]: I work at Google in Bangalore, earning 3.5 lakh per month."],
    )
    # Legacy top-level fields (still supported)
    client_id: Optional[str] = Field(None, examples=["client_1"], description="Unique client identifier (legacy)")
    client_name: Optional[str] = Field(None, examples=["Rahul Sharma"])
    mode: str = Field("prod", examples=["prod"], description="'dev' for testing, 'prod' for production")
    model: Optional[str] = Field(None, examples=["claude-opus-4-6"], description="Override LLM model for this request only")
    # New meeting-service fields
    meeting_id: Optional[str] = Field(None, examples=["meeting-001"], description="Caller's meeting id — echoed in logs only")
    context: Optional[ExtractContext] = Field(None, description="Meeting context block (preferred over top-level fields)")


class ChunkRequest(BaseModel):
    client_id: Optional[str] = Field(None, examples=["client_1"])
    chunk: str = Field(..., examples=["Speaker 1 [1:32]: What is your monthly income?"])


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["System"], summary="Health check")
def health():
    """Returns `200 OK` when the service is running."""
    return {"status": "ok"}


@app.post(
    "/extract",
    tags=["Extraction"],
    summary="Extract CRM fields from a transcript",
    response_description="Extracted fields with confidence >= threshold, token usage, and processing time",
)
def extract(req: ExtractRequest):
    """
    Runs all extraction agents on the supplied transcript:

    | Agent | Touch Point |
    |---|---|
    | DemographicsAgent | Demographics & Family |
    | FinanceAgent | Finances |
    | GoalsAgent | Life Goals |
    | ProfessionalAgent | Professional Details |
    | ScheduleAgent | Schedule & Communication |
    | QualitativeAgent | Qualitative Parameters |
    | TaskAgent | Task Priority |
    | FeedbackAgent | Custom Fields |

    Returns only fields with **confidence >= CONFIDENCE_THRESHOLD** (default 0.70).
    Also persists JSON, Excel, and HTML artefacts to the `output/` folder.
    """
    if req.mode not in ("dev", "prod"):
        raise HTTPException(status_code=400, detail="mode must be 'dev' or 'prod'")

    # Unify legacy + meeting-service shapes. Context block takes precedence.
    ctx = req.context or ExtractContext()
    client_id     = (ctx.client_id   or req.client_id   or "").strip()
    client_name   = (ctx.client_name or req.client_name or "").strip()
    agents_to_use = ctx.agents_to_use or None

    if not client_id:
        raise HTTPException(status_code=400, detail="client_id is required (top-level or in context)")

    try:
        result = run_extraction(
            client_id=client_id,
            client_name=client_name,
            transcript=req.transcript,
            mode=req.mode,
            model=req.model,
            agents_to_use=agents_to_use,
            meeting_id=req.meeting_id,
        )
        return result

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        logger.error("Extraction error client=%s: %s", req.client_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/transcript/chunk",
    tags=["Streaming"],
    summary="Submit a live transcript chunk (placeholder)",
    response_description="Acknowledgement with chunk length",
)
def transcript_chunk(req: ChunkRequest):
    """
    **Placeholder** for Fireflies / live call-streaming integration.

    Currently logs the chunk. Will support incremental CRM extraction in a future release.
    """
    if not req.chunk.strip():
        raise HTTPException(status_code=400, detail="chunk must not be empty")

    process_live_transcript_chunk(req.chunk, req.client_id or "")
    return {"status": "received", "length": len(req.chunk)}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
