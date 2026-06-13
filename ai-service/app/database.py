"""
app/database.py
───────────────
Async MongoDB client using Motor.
Provides helper functions to access specific collections.
"""

import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client singleton — created once per process
# ---------------------------------------------------------------------------

_client: AsyncIOMotorClient | None = None


def _get_client() -> AsyncIOMotorClient:
    """
    Return (and lazily create) the shared Motor client.

    The client is intentionally module-level so it is reused across requests.
    Motor handles connection pooling internally.

    Returns:
        AsyncIOMotorClient: The shared Motor client instance.
    """
    global _client
    if _client is None:
        try:
            _client = AsyncIOMotorClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=5_000,
            )
            logger.info("🗄️  Motor MongoDB client initialised → %s", settings.MONGODB_URI)
        except Exception as exc:  # noqa: BLE001
            logger.error("❌  Failed to create MongoDB client: %s", exc)
            raise
    return _client


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


async def get_database() -> AsyncIOMotorDatabase:
    """
    Return the primary ElderEase database handle.

    Returns:
        AsyncIOMotorDatabase: The database.
    """
    client = _get_client()
    return client.get_default_database(default="test")


async def get_chat_collection() -> AsyncIOMotorCollection:
    """
    Return the `chat_messages` collection.

    Schema (informal):
        userId      : str
        role        : 'user' | 'assistant'
        content     : str
        timestamp   : datetime (UTC)

    Returns:
        AsyncIOMotorCollection: The chat_messages collection handle.
    """
    db = await get_database()
    return db["chat_messages"]


async def get_mood_collection() -> AsyncIOMotorCollection:
    """
    Return the `mood_scores` collection.

    Schema (informal):
        userId      : str
        date        : str  (YYYY-MM-DD)
        score       : float  (0–10)
        rawSentiment: float  (-1–1)
        messageCount: int
        updatedAt   : datetime (UTC)

    Returns:
        AsyncIOMotorCollection: The mood_scores collection handle.
    """
    db = await get_database()
    return db["mood_scores"]


async def get_anomaly_collection() -> AsyncIOMotorCollection:
    """
    Return the `anomaly_flags` collection.

    Schema (informal):
        userId      : str
        isAnomaly   : bool
        score       : float
        severity    : str  ('low' | 'medium' | 'high')
        details     : dict
        detectedAt  : datetime (UTC)

    Returns:
        AsyncIOMotorCollection: The anomaly_flags collection handle.
    """
    db = await get_database()
    return db["anomaly_flags"]
