from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # MongoDB
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "jojo_invoice_tracker"

    # Auth (JWT for API)
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Bootstrap user (optional): created on first login if not present
    BOOTSTRAP_ADMIN_EMAIL: str = "appmanager@appjojo.in"
    BOOTSTRAP_ADMIN_PASSWORD: str = "admin123!@#"

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Legacy (PDF upload / OCR) settings - kept for now
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_FILE_TYPES: list[str] = ["application/pdf"]

    # Gmail API (email notifications)
    GMAIL_CLIENT_SECRET_PATH: str = "client_secret_625886217018-t46dtofa5sifpe5c9566kg93n364e1g9.apps.googleusercontent.com.json"
    GMAIL_TOKEN_PATH: str = "gmail_tokens.json"
    GMAIL_SENDER_EMAIL: str = ""

    # Daily admin report email (Mon–Sat 12:00 Asia/Kolkata)
    ADMIN_REPORT_EMAIL: str = ""
    SYSTEM_URL: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
