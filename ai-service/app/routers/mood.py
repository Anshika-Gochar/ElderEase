"""
ai-service/app/routers/mood.py  MODIFY
───────────────────────────────────────
Mood router — /mood

Endpoints:
    POST /                     → Analyse a batch of messages; upsert daily mood score.
    GET  /{user_id}            → Return last 7 days of mood scores with sentimentLabel.
    GET  /{user_id}/weekly     → Return 7-day rolling average.
    GET  /{user_id}/monthly    → Return last 30 days of mood scores (sparse — no null days).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.database import get_mood_collection
from app.models.schemas import MoodAnalyzeRequest, MoodHistoryResponse, MoodScore

logger = logging.getLogger(__name__)

router = APIRouter(tags=["mood"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _today_utc() -> str:
    """Return today's date in YYYY-MM-DD format (UTC)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _sentiment_label(score: float) -> str:
    """
    Map a numeric mood score (0–10) to a human-readable sentiment label.

    Args:
        score: Mood score between 0 and 10.

    Returns:
        'positive' | 'neutral' | 'negative'
    """
    if score >= 7:
        return "positive"
    if score >= 4:
        return "neutral"
    return "negative"


def _enrich(doc: dict) -> dict:
    """
    Add sentimentLabel to a raw MoodScore document if not already present.

    Args:
        doc: Raw MongoDB document with at least a 'score' field.

    Returns:
        The same dict with 'sentimentLabel' set.
    """
    doc["sentimentLabel"] = doc.get("sentimentLabel") or _sentiment_label(doc["score"])
    return doc


# ---------------------------------------------------------------------------
# POST /mood/
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=MoodScore,
    summary="Analyse messages and store today's mood score",
)
async def analyze_mood(request: MoodAnalyzeRequest) -> MoodScore:
    """
    Analyse a list of messages with VADER sentiment and persist the result.

    If a mood score already exists for this user on this date it is updated
    (upsert), so this endpoint is idempotent and can be called multiple times
    throughout the day as new messages arrive.

    Args:
        request: MoodAnalyzeRequest with userId, messages list, and optional date.

    Returns:
        MoodScore object with the normalised score and metadata.

    Raises:
        HTTPException 422: If messages list is empty.
        HTTPException 500: On database errors.
    """
    from app.services.mood_analyzer import analyze_messages  # local import to avoid circular

    try:
        date = request.date or _today_utc()
        analysis = analyze_messages(request.messages)

        mood_doc = {
            "userId":       request.userId,
            "date":         date,
            "score":        analysis["score"],
            "rawSentiment": analysis["rawSentiment"],
            "messageCount": analysis["messageCount"],
            "updatedAt":    datetime.now(timezone.utc),
        }

        collection = await get_mood_collection()

        # Upsert — replace the record for this user+date if it exists
        await collection.update_one(
            {"userId": request.userId, "date": date},
            {"$set": mood_doc},
            upsert=True,
        )

        logger.info(
            "Mood score upserted for user %s on %s: %.2f",
            request.userId,
            date,
            analysis["score"],
        )

        return MoodScore(
            userId=request.userId,
            date=date,
            score=analysis["score"],
            rawSentiment=analysis["rawSentiment"],
            messageCount=analysis["messageCount"],
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Mood analysis error for user %s: %s", request.userId, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to analyse mood.") from exc


# ---------------------------------------------------------------------------
# GET /mood/{user_id}  — last 7 days
# ---------------------------------------------------------------------------


@router.get(
    "/{user_id}",
    response_model=MoodHistoryResponse,
    summary="Get last 7 days of mood scores",
)
async def get_mood_history(user_id: str) -> MoodHistoryResponse:
    """
    Return the most recent 7 daily mood scores for a user, with sentimentLabel.

    Scores are returned in chronological order (oldest first).
    sentimentLabel is computed at read time if not stored: >=7 positive,
    >=4 neutral, <4 negative.

    Args:
        user_id: The elder's unique identifier.

    Returns:
        MoodHistoryResponse with userId and list of MoodScore objects.

    Raises:
        HTTPException 500: On database errors.
    """
    try:
        collection = await get_mood_collection()

        raw_scores = await collection.find(
            {"userId": user_id},
            {"_id": 0, "userId": 1, "date": 1, "score": 1, "rawSentiment": 1,
             "messageCount": 1, "sentimentLabel": 1},
        ).sort("date", -1).limit(7).to_list(length=7)

        # Chronological order for the response
        raw_scores.reverse()

        scores = [
            MoodScore(
                userId=s["userId"],
                date=s["date"],
                score=s["score"],
                rawSentiment=s.get("rawSentiment", 0.0),
                messageCount=s.get("messageCount", 0),
                sentimentLabel=_sentiment_label(s["score"]),
            )
            for s in raw_scores
        ]

        return MoodHistoryResponse(userId=user_id, scores=scores)

    except Exception as exc:
        logger.error("Mood history fetch error for user %s: %s", user_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch mood history.") from exc


# ---------------------------------------------------------------------------
# GET /mood/{user_id}/weekly  — 7-day rolling average
# ---------------------------------------------------------------------------


@router.get(
    "/{user_id}/weekly",
    summary="Get 7-day rolling average mood score",
)
async def get_weekly_average(user_id: str) -> dict:
    """
    Return the 7-day rolling average mood score for a user.

    Fetches the last 7 days of scores and computes a simple mean. Also
    returns the individual daily scores for sparkline charts.

    Args:
        user_id: The elder's unique identifier.

    Returns:
        dict with rollingAverage, label, and daily scores breakdown.

    Raises:
        HTTPException 500: On database errors.
    """
    from app.services.mood_analyzer import rolling_average  # local import

    try:
        collection = await get_mood_collection()

        raw_scores = await collection.find(
            {"userId": user_id},
            {"_id": 0, "date": 1, "score": 1},
        ).sort("date", -1).limit(7).to_list(length=7)

        raw_scores.reverse()

        score_values = [s["score"] for s in raw_scores]
        avg = rolling_average(score_values, window=7)

        # Label for the caregiver dashboard
        if avg >= 7:
            label = "Great"
        elif avg >= 5:
            label = "Good"
        elif avg >= 3:
            label = "Fair"
        else:
            label = "Needs Attention"

        return {
            "userId":         user_id,
            "rollingAverage": avg,
            "label":          label,
            "dailyScores":    raw_scores,
            "dayCount":       len(raw_scores),
        }

    except Exception as exc:
        logger.error("Weekly avg error for user %s: %s", user_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to compute weekly average.") from exc


# ---------------------------------------------------------------------------
# GET /mood/{user_id}/monthly  — last 30 days (sparse — no null days)
# ---------------------------------------------------------------------------


@router.get(
    "/{user_id}/monthly",
    summary="Get last 30 days of mood scores (sparse)",
)
async def get_mood_monthly(user_id: str) -> dict:
    """
    Return up to 30 days of mood scores for a user.

    Days with no chat activity (no MoodScore document) are omitted entirely
    rather than returned as nulls — the response is intentionally sparse.
    Each entry includes sentimentLabel computed at read time.

    Scores are returned in chronological order (oldest first) so the
    frontend can render them left-to-right on a chart without reversing.

    Args:
        user_id: The elder's unique identifier.

    Returns:
        dict with userId, scores list (chronological), and dayCount.

    Raises:
        HTTPException 500: On database errors.
    """
    try:
        collection = await get_mood_collection()

        raw_scores = await collection.find(
            {"userId": user_id},
            {"_id": 0, "date": 1, "score": 1, "rawSentiment": 1,
             "messageCount": 1, "sentimentLabel": 1},
        ).sort("date", -1).limit(30).to_list(length=30)

        # Chronological order (oldest → newest) for chart rendering
        raw_scores.reverse()

        scores = [
            {
                "date":           s["date"],
                "score":          s["score"],
                "rawSentiment":   s.get("rawSentiment", 0.0),
                "messageCount":   s.get("messageCount", 0),
                "sentimentLabel": _sentiment_label(s["score"]),
            }
            for s in raw_scores
            # Guard: skip any doc that somehow has a null score
            if s.get("score") is not None
        ]

        return {
            "userId":   user_id,
            "scores":   scores,
            "dayCount": len(scores),
        }

    except Exception as exc:
        logger.error("Monthly mood fetch error for user %s: %s", user_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch monthly mood.") from exc
