"""
ai-service/app/config.py  MODIFY
──────────────────────────────────
Centralised settings for the ElderEase AI Service.
Uses pydantic-settings to load values from environment / .env file.
"""

import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """
    Application configuration loaded from environment variables.

    All fields can be overridden via a `.env` file placed in the ai-service
    root directory, or via actual environment variables (env vars take
    precedence over .env file values).
    """

    # ── Gemini AI ────────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    """
    Google Gemini API key.
    Get a free key at: https://aistudio.google.com/app/apikey
    Leave empty to run in stub mode.
    """

    GEMINI_MODEL: str = "gemini-2.5-flash"
    """
    Gemini model name to use for chat and summary generation.
    Default: gemini-2.5-flash (fast, cost-effective).
    Override with e.g. gemini-1.5-pro for higher quality at higher cost.
    """

    # ── MongoDB ───────────────────────────────────────────────────────────────
    MONGODB_URI: str = "mongodb://localhost:27017/elderease"
    """Full MongoDB connection URI including database name."""

    # ── Backend service (reference only) ─────────────────────────────────────
    BACKEND_URL: str = "http://localhost:5000"
    """Base URL of the Node.js/Express backend service."""

    # ── Server ────────────────────────────────────────────────────────────────
    PORT: int = 8000
    """Port the AI service will listen on."""

    # ── Feature flags ─────────────────────────────────────────────────────────
    STUB_MODE: bool = True
    """
    When True, Gemini calls are replaced with warm mock responses.
    Set to False once GEMINI_API_KEY is configured.
    Both STUB_MODE=false AND a non-empty GEMINI_API_KEY are required
    for real Gemini responses to be returned.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def gemini_available(self) -> bool:
        """
        Return True only when a non-placeholder Gemini API key has been
        provided and STUB_MODE is False.

        Strips leading/trailing whitespace from the key before checking —
        a key with a trailing newline from .env reads as truthy but fails
        all API calls, so we normalise it here.
        """
        key = self.GEMINI_API_KEY.strip()
        if not key:
            return False
        # Reject the exact .env.example placeholder value
        if key == "your-gemini-api-key":
            return False
        return not self.STUB_MODE

    @property
    def mongodb_uri(self) -> str:
        """Convenience alias (lowercase) for MONGODB_URI."""
        return self.MONGODB_URI


# Singleton instance — import this everywhere:
#   from app.config import settings
settings = Settings()

# ── Startup diagnostic log ────────────────────────────────────────────────────
# Emitted once at import time so the very first log line tells you whether
# real Gemini is active.  Useful when checking service startup output.
logger.info(f"Gemini available: {settings.gemini_available}")
