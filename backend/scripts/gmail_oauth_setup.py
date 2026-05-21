"""
One-time Gmail OAuth setup: open browser for consent and save token file
(redirect_uri, access_token, refresh_token, expiry) for the backend to use.

Run from project root or backend with PYTHONPATH including the backend directory:
  python -m scripts.gmail_oauth_setup
  or: cd backend && python scripts/gmail_oauth_setup.py (with PYTHONPATH=.)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Allow running as script or module
if __name__ == "__main__":
    backend = Path(__file__).resolve().parent.parent
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))
    os.chdir(backend)

from dotenv import load_dotenv

load_dotenv()

from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import get_settings
from app.services.gmail_oauth import SCOPES


def main() -> None:
    settings = get_settings()
    client_secret_path = Path(settings.GMAIL_CLIENT_SECRET_PATH)
    if not client_secret_path.is_absolute():
        # Try backend dir, then cwd, then parent (project root)
        for base in [Path.cwd(), Path.cwd().parent]:
            candidate = base / client_secret_path
            if candidate.exists():
                client_secret_path = candidate
                break
        else:
            client_secret_path = Path.cwd() / settings.GMAIL_CLIENT_SECRET_PATH

    if not client_secret_path.exists():
        print(f"ERROR: Client secret file not found: {client_secret_path}")
        print("Set GMAIL_CLIENT_SECRET_PATH in .env or place the JSON file in the backend directory.")
        sys.exit(1)

    token_path = Path(settings.GMAIL_TOKEN_PATH)
    if not token_path.is_absolute():
        token_path = Path.cwd() / token_path

    # Try ports 8080, 8081, ... until one is free (WinError 10048 = port in use)
    flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_path), SCOPES)
    port = 8080
    redirect_uri = None
    for attempt in range(10):
        try:
            redirect_uri = f"http://localhost:{port}/"
            flow.redirect_uri = redirect_uri
            print("Opening browser for Gmail OAuth consent...")
            print(f"  Redirect URI: {redirect_uri}")
            if port != 8080:
                print("  (Port 8080 was in use; using this port. Add the URI above to Google Cloud Console if needed.)")
            print("  If you get 'redirect_uri_mismatch', add this exact URI in Google Cloud Console:")
            print("  APIs & Services -> Credentials -> your OAuth 2.0 Client -> Authorized redirect URIs")
            creds = flow.run_local_server(port=port, prompt="consent", access_type="offline")
            break
        except OSError as e:
            if "10048" in str(e) or "address already in use" in str(e).lower() or "Errno 48" in str(e):
                port += 1
                if attempt >= 9:
                    print("ERROR: Could not find a free port (tried 8080-8089). Stop the process using port 8080 and try again.")
                    sys.exit(1)
                continue
            raise
    else:
        raise RuntimeError("OAuth flow did not complete")

    redirect_uri = getattr(flow, "redirect_uri", None) or redirect_uri
    token_data = {
        "redirect_uri": redirect_uri,
        "access_token": creds.token,
        "refresh_token": creds.refresh_token or "",
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }
    with open(token_path, "w", encoding="utf-8") as f:
        json.dump(token_data, f, indent=2)
    print(f"Token saved to: {token_path}")
    print("Add this path to .gitignore if not already (e.g. gmail_tokens.json).")
    print("If Gmail email notifications still don't send, check backend logs for 'Gmail' errors and ensure the OAuth account has permission to send mail.")

if __name__ == "__main__":
    main()
