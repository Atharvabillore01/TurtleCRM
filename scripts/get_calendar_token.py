"""
One-time script to get an OAuth2 refresh token for the ops team Google account.

Run once, then paste GOOGLE_CALENDAR_REFRESH_TOKEN into your .env.

Usage:
    pip install google-auth-oauthlib
    python scripts/get_calendar_token.py
"""

import os
from google_auth_oauthlib.flow import InstalledAppFlow

CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

if not CLIENT_ID or not CLIENT_SECRET:
    raise SystemExit("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first.")

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]

client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
    }
}

flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
# Opens browser. Sign in as the OPS TEAM email (not your personal account).
creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")

print("\n✅ Done! Add this to your .env:\n")
print(f"GOOGLE_CALENDAR_REFRESH_TOKEN={creds.refresh_token}")
