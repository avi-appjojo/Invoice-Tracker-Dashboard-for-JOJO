"""
Gmail OAuth: load token file (redirect_uri, access_token, refresh_token, expiry),
refresh access token when expired, and optionally rewrite the token file.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

from app.config import get_settings

logger = logging.getLogger(__name__)

# Gmail scopes (gmail.metadata needed to read authenticated user's email for From header)
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.metadata",
]


def _resolve_path(path_str: str, base_dir: Path | None = None) -> Path:
    """Resolve path: if not absolute, try relative to base_dir or cwd."""
    p = Path(path_str)
    if p.is_absolute():
        return p
    if base_dir is not None:
        candidate = base_dir / p
        if candidate.exists():
            return candidate
    # Try cwd (e.g. when running from backend/)
    if p.exists():
        return p.resolve()
    # Try parent (e.g. project root when client_secret is there)
    parent = Path.cwd().parent
    if parent.exists():
        candidate = parent / p
        if candidate.exists():
            return candidate
    return Path.cwd() / p


def _load_client_secret() -> dict[str, Any]:
    settings = get_settings()
    path = _resolve_path(settings.GMAIL_CLIENT_SECRET_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Gmail client secret not found: {path}")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # Format: {"web": {"client_id": "...", "client_secret": "...", "token_uri": "https://oauth2.googleapis.com/token", ...}}
    web = data.get("web", data)
    return {
        "client_id": web["client_id"],
        "client_secret": web["client_secret"],
        "token_uri": web.get("token_uri", "https://oauth2.googleapis.com/token"),
    }


def _load_token_file() -> dict[str, Any] | None:
    settings = get_settings()
    path = _resolve_path(settings.GMAIL_TOKEN_PATH)
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_token_file(data: dict[str, Any]) -> None:
    settings = get_settings()
    path = _resolve_path(settings.GMAIL_TOKEN_PATH)
    path = path if path.is_absolute() else Path.cwd() / path
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _is_expired(expiry_str: str | None) -> bool:
    if not expiry_str:
        return True
    try:
        # Assume ISO format or timestamp
        if expiry_str.replace(".", "").isdigit():
            expiry = datetime.fromtimestamp(float(expiry_str), tz=timezone.utc)
        else:
            expiry = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
        return expiry <= datetime.now(timezone.utc)
    except Exception:
        return True


def get_credentials() -> Credentials | None:
    """
    Load credentials from token file and client secret. Refresh access token if expired.
    Updates the token file with new access_token and expiry after refresh.
    Returns None if token file is missing or refresh fails.
    """
    try:
        client = _load_client_secret()
    except FileNotFoundError as e:
        logger.warning("Gmail client secret not found: %s", e)
        return None
    except Exception as e:
        logger.warning("Failed to load Gmail client secret: %s", e)
        return None

    token_data = _load_token_file()
    if not token_data or not token_data.get("refresh_token"):
        logger.warning("Gmail token file missing or has no refresh_token. Run gmail_oauth_setup.py first.")
        return None

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expiry_str = token_data.get("expiry")
    redirect_uri = token_data.get("redirect_uri")

    credentials = Credentials(
        token=access_token or None,
        refresh_token=refresh_token,
        token_uri=client["token_uri"],
        client_id=client["client_id"],
        client_secret=client["client_secret"],
        scopes=SCOPES,
    )
    # Set expiry for refresh check
    if expiry_str:
        try:
            if expiry_str.replace(".", "").isdigit():
                credentials.expiry = datetime.fromtimestamp(float(expiry_str), tz=timezone.utc)
            else:
                credentials.expiry = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
        except Exception:
            pass

    if _is_expired(expiry_str):
        try:
            request = Request()
            credentials.refresh(request)
            # Persist new token to file
            new_data = {
                "redirect_uri": redirect_uri,
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token or refresh_token,
                "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            }
            _save_token_file(new_data)
        except Exception as e:
            logger.warning("Gmail token refresh failed: %s", e)
            return None

    return credentials
