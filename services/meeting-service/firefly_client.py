"""
Fireflies.ai GraphQL client.

Fireflies.ai is an AI meeting recorder. This client:
  - Adds the Fireflies bot to a meeting via a meeting URL
  - Fetches transcripts after recording

API endpoint: https://api.fireflies.ai/graphql
Auth: Authorization: Bearer <FIREFLY_API_KEY>

Fireflies doesn't "create" meetings — it joins existing video calls.
The typical flow:
  1. Create a video call link (Zoom/Meet/Teams) externally
  2. Call add_to_meeting() to invite the Fireflies bot to record
  3. Bot joins, records, produces transcript
  4. Webhook fires when transcript is ready

Docs: https://docs.fireflies.ai/graphql-api/
"""

import httpx
from logger import get_logger

logger = get_logger("meeting-service")

FIREFLY_API = "https://api.fireflies.ai/graphql"


class FireflyClient:
    def __init__(self, api_key: str) -> None:
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def add_to_meeting(self, meeting_url: str, title: str, scheduled_at: str) -> dict:
        """
        Invite the Fireflies bot to a meeting URL so it records automatically.
        Returns { meeting_id, bot_id }.
        """
        query = """
        mutation AddToLiveMeeting($url: String!, $title: String!, $scheduledAt: String) {
          addToLiveMeeting(
            url: $url
            title: $title
            scheduled_at: $scheduledAt
          ) {
            id
            title
            organizer_email
          }
        }
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                FIREFLY_API,
                headers=self._headers,
                json={
                    "query": query,
                    "variables": {
                        "url": meeting_url,
                        "title": title,
                        "scheduledAt": scheduled_at,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                raise RuntimeError(f"Firefly API error: {data['errors']}")
            meeting = data["data"]["addToLiveMeeting"]
            return {"firefly_meeting_id": meeting["id"], "firefly_meeting_url": meeting_url}

    async def get_transcript(self, firefly_meeting_id: str) -> str:
        """Fetch the full transcript text for a completed meeting."""
        query = """
        query GetTranscript($id: String!) {
          transcript(id: $id) {
            id
            title
            transcript_url
            sentences {
              text
              speaker_name
            }
          }
        }
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                FIREFLY_API,
                headers=self._headers,
                json={"query": query, "variables": {"id": firefly_meeting_id}},
            )
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                raise RuntimeError(f"Firefly API error: {data['errors']}")
            transcript = data["data"]["transcript"]
            # Join sentences into a readable transcript
            lines = [
                f"{s['speaker_name']}: {s['text']}"
                for s in (transcript.get("sentences") or [])
            ]
            return "\n".join(lines)

    async def cancel_meeting(self, firefly_meeting_id: str) -> bool:
        """
        Fireflies doesn't support cancelling a bot invite via API.
        You'd need to remove the bot from the calendar event.
        This is a no-op stub that logs the intent.
        """
        logger.warning(
            "firefly_cancel_not_supported",
            extra={"firefly_meeting_id": firefly_meeting_id},
        )
        return True
