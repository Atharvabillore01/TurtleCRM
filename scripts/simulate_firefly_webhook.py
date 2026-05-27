"""
Simulate a Fireflies webhook POST to meeting-service.

Use this to test the transcript pipeline without depending on a real
Fireflies meeting. Signs the body with FIREFLY_WEBHOOK_SECRET so the
receiver's signature check passes.

Usage:
    python scripts/simulate_firefly_webhook.py
    python scripts/simulate_firefly_webhook.py --url http://localhost:4004
    python scripts/simulate_firefly_webhook.py --meeting-id firefly-abc123
"""

import argparse
import hashlib
import hmac
import json
import os
import sys
import urllib.request


DEFAULT_TRANSCRIPT = """\
Atharva: Hi, thanks for joining today.
Client: Happy to be here. So you wanted to discuss the portfolio?
Atharva: Yes — we want to rebalance toward more equity. Around 70/30.
Client: That sounds aggressive. What's the rationale?
Atharva: Long horizon, 15+ years. We can take the volatility.
Client: Okay, let's go ahead with that. Send me the paperwork by Friday.
"""


def build_payload(firefly_meeting_id: str, transcript: str) -> dict:
    return {
        "eventType": "Transcription completed",
        "meetingId": firefly_meeting_id,
        "meeting": {
            "id": firefly_meeting_id,
            "transcript": transcript,
            "transcript_url": f"https://app.fireflies.ai/view/{firefly_meeting_id}",
            "duration": 1800,
        },
    }


def sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:4004",
                        help="meeting-service base URL")
    parser.add_argument("--meeting-id", default="firefly-test-001",
                        help="firefly_meeting_id (should match a scheduled meeting)")
    parser.add_argument("--secret", default=os.environ.get("FIREFLY_WEBHOOK_SECRET", ""),
                        help="webhook secret (defaults to FIREFLY_WEBHOOK_SECRET env)")
    parser.add_argument("--transcript", default=DEFAULT_TRANSCRIPT,
                        help="transcript text to inject")
    parser.add_argument("--event", default="Transcription completed",
                        choices=["Transcription completed", "Meeting completed"])
    args = parser.parse_args()

    if not args.secret:
        print("ERROR: provide --secret or set FIREFLY_WEBHOOK_SECRET", file=sys.stderr)
        return 1

    payload = build_payload(args.meeting_id, args.transcript)
    payload["eventType"] = args.event
    body = json.dumps(payload).encode()
    signature = sign(body, args.secret)

    req = urllib.request.Request(
        f"{args.url.rstrip('/')}/webhooks/firefly",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-fireflies-signature": signature,
        },
        method="POST",
    )

    print(f"POST {req.full_url}")
    print(f"  x-fireflies-signature: {signature}")
    print(f"  body bytes: {len(body)}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"  -> {resp.status} {resp.reason}")
            print(f"  body: {resp.read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"  -> {e.code} {e.reason}")
        print(f"  body: {e.read().decode()}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
