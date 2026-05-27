"""
data_persistence — consumes extraction.save events.

Splits the 174-field extraction into domain buckets and calls the relevant
domain procs (demographics, financials, goals, qualitative).
"""

from db.meeting_procs import (
    proc_get_extraction,
    proc_save_demographics,
    proc_save_financials,
    proc_save_goals,
    proc_save_qualitative,
)
from eventbus import start_consumer
from logger import get_logger

logger = get_logger("meeting-service")

_DEMOGRAPHIC_FIELDS = set(range(1, 43))
_FINANCIAL_FIELDS = set(range(43, 79))
_GOALS_FIELDS = set(range(79, 84))
_QUALITATIVE_FIELDS = set(range(144, 159))


def _bucket(raw_data: dict, field_ids: set[int]) -> dict:
    result = {}
    for k, v in raw_data.items():
        try:
            if int(k) in field_ids:
                result[k] = v
        except (ValueError, TypeError):
            pass
    return result


async def _handle_save(payload: dict) -> None:
    extraction_id = payload.get("extraction_id", "")
    client_id = payload.get("client_id", "")

    try:
        extraction = await proc_get_extraction(extraction_id)
    except ValueError as exc:
        logger.error("data_persistence_extraction_not_found", extra={"error": str(exc), "extraction_id": extraction_id})
        return

    raw = extraction.raw_data

    try:
        await proc_save_demographics(
            client_id=client_id,
            extraction_id=extraction_id,
            data=_bucket(raw, _DEMOGRAPHIC_FIELDS),
        )
        await proc_save_financials(
            client_id=client_id,
            extraction_id=extraction_id,
            data=_bucket(raw, _FINANCIAL_FIELDS),
        )
        await proc_save_goals(
            client_id=client_id,
            extraction_id=extraction_id,
            data=_bucket(raw, _GOALS_FIELDS),
        )
        await proc_save_qualitative(
            client_id=client_id,
            extraction_id=extraction_id,
            data=_bucket(raw, _QUALITATIVE_FIELDS),
        )
    except RuntimeError as exc:
        logger.error("data_persistence_failed", extra={"error": str(exc), "extraction_id": extraction_id})
        return

    logger.info("data_persistence_completed", extra={"extraction_id": extraction_id, "client_id": client_id})


async def run_data_persistence() -> None:
    await start_consumer("extraction.save", "meeting-service-persistence", _handle_save)
