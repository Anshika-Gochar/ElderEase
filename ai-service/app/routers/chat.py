"""
ai-service/app/routers/chat.py  MODIFY
───────────────────────────────────────
Chat router — prefix: /chat

Endpoints:
    POST /           → Send a message; get AI companion response + mood score.
    GET  /history/{elderId} → Retrieve last 50 messages for an elder.
    POST /summary    → Generate caregiver daily digest summary.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.database import get_chat_collection, get_mood_collection
from app.services.gemini_chat import generate_response, generate_caregiver_summary
from app.services.mood_analyzer import analyze_messages, get_mood_label

logger = logging.getLogger(__name__)

# Emitted once when this module is first imported (i.e. at service startup)
logger.info("Chat router loaded")

router = APIRouter(tags=["chat"])


# ---------------------------------------------------------------------------
# Request / Response schemas (inline — avoids import chain changes)
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    elderId: str
    message: str


class ChatResponseModel(BaseModel):
    response: str
    moodScore: float


class SummaryRequest(BaseModel):
    elderId: str


# ---------------------------------------------------------------------------
# POST /chat/
# ---------------------------------------------------------------------------

# Safe fallback returned when generate_response raises any unhandled exception
_CHAT_FALLBACK_RESPONSE = "I'm here with you. Could you tell me more about how you're feeling?"
_CHAT_FALLBACK_MOOD = 5.0


@router.post("/", summary="Send a message to Saathi")
async def chat(request: ChatRequest) -> dict:
    """
    Full chat flow:
    1. Fetch last 20 ChatMessage docs for this elder (sorted asc) → history
    2. Call generate_response(elderId, message, history) → response str
    3. Save user message + assistant reply to MongoDB
    4. Analyze user message sentiment via VADER → moodScore 0-10
    5. Upsert today's MoodScore (rolling average if multiple chats today)
    6. Return { response, moodScore }
    """
    try:
        chat_col = await get_chat_collection()
        mood_col = await get_mood_collection()

        # ── 1. Fetch history ─────────────────────────────────────────────────
        raw_history = await chat_col.find(
            {"userId": request.elderId},
            {"_id": 0, "role": 1, "content": 1},
        ).sort("timestamp", 1).limit(20).to_list(length=20)

        # Build history in the shape generate_response expects
        history = [
            {"role": doc["role"], "content": doc["content"]}
            for doc in raw_history
        ]

        # ── 2. Generate AI response ──────────────────────────────────────────
        logger.info(
            "Chat request — elderId: %s, gemini: %s",
            request.elderId,
            settings.gemini_available,
        )

        try:
            response_text = await generate_response(
                elderId=request.elderId,
                message=request.message,
                history=history,
            )
        except Exception as ai_exc:  # noqa: BLE001
            logger.error(
                "❌  generate_response raised an exception for elder %s: %s",
                request.elderId,
                ai_exc,
                exc_info=True,
            )
            return {
                "response":  _CHAT_FALLBACK_RESPONSE,
                "moodScore": _CHAT_FALLBACK_MOOD,
            }

        now = datetime.now(timezone.utc)

        # ── 3. Persist both messages ─────────────────────────────────────────
        await chat_col.insert_many([
            {
                "userId":    request.elderId,
                "role":      "user",
                "content":   request.message,
                "sentimentScore": None,
                "timestamp": now,
            },
            {
                "userId":    request.elderId,
                "role":      "assistant",
                "content":   response_text,
                "sentimentScore": None,
                "timestamp": now,
            },
        ])

        logger.info("💬  Chat exchange saved for elder %s.", request.elderId)

        # ── 4. Analyze mood from user message ────────────────────────────────
        mood_result = analyze_messages([request.message])
        mood_score: float = mood_result["score"]
        raw_sentiment: float = mood_result["rawSentiment"]

        # ── 5. Upsert today's MoodScore (rolling average) ────────────────────
        # NOTE: use 'userId' field (matches mood router's query field)
        today_str = now.strftime("%Y-%m-%d")

        existing = await mood_col.find_one(
            {"userId": request.elderId, "date": today_str}
        )

        if existing:
            # Rolling average: (old_score * old_count + new_score) / (old_count + 1)
            old_count = existing.get("messageCount", 1)
            old_score = existing.get("score", mood_score)
            new_count = old_count + 1
            new_avg = round((old_score * old_count + mood_score) / new_count, 2)

            await mood_col.update_one(
                {"userId": request.elderId, "date": today_str},
                {
                    "$set": {
                        "score":        new_avg,
                        "rawSentiment": raw_sentiment,
                        "messageCount": new_count,
                        "updatedAt":    now,
                    }
                },
            )
            mood_score = new_avg
        else:
            await mood_col.insert_one({
                "userId":       request.elderId,
                "date":         today_str,
                "score":        mood_score,
                "rawSentiment": raw_sentiment,
                "messageCount": 1,
                "updatedAt":    now,
            })

        logger.info(
            "📊  Mood score updated for elder %s: %.2f on %s.",
            request.elderId,
            mood_score,
            today_str,
        )

        # ── 6. Return response + mood score ──────────────────────────────────
        return {
            "response":  response_text,
            "moodScore": mood_score,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "❌  Chat endpoint error for elder %s: %s",
            request.elderId,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="AI service error. Please try again.",
        ) from exc


# ---------------------------------------------------------------------------
# GET /chat/history/{elderId}
# ---------------------------------------------------------------------------


@router.get("/history/{elderId}", summary="Retrieve chat history for an elder")
async def get_history(elderId: str, limit: int = 50) -> list:
    """
    Return last `limit` ChatMessage docs for this elder, sorted chronologically.

    Returns a plain list — each item has: _id (str), role, content,
    createdAt (from timestamp field), sentimentScore.
    """
    try:
        chat_col = await get_chat_collection()

        cursor = chat_col.find(
            {"userId": elderId},
            {"role": 1, "content": 1, "timestamp": 1, "sentimentScore": 1},
        ).sort("timestamp", -1).limit(min(limit, 200))

        docs = await cursor.to_list(length=min(limit, 200))

        # Reverse to get chronological order
        docs.reverse()

        # Normalise _id to string and map timestamp → createdAt for frontend
        result = []
        for doc in docs:
            result.append({
                "_id":          str(doc.get("_id", "")),
                "role":         doc.get("role", "user"),
                "content":      doc.get("content", ""),
                "createdAt":    doc.get("timestamp", datetime.now(timezone.utc)).isoformat(),
                "sentimentScore": doc.get("sentimentScore"),
            })

        return result

    except Exception as exc:
        logger.error(
            "❌  History fetch error for elder %s: %s", elderId, exc, exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch chat history.",
        ) from exc


# ---------------------------------------------------------------------------
# POST /chat/summary
# ---------------------------------------------------------------------------


@router.post("/summary", summary="Generate caregiver daily digest")
async def generate_summary(request: SummaryRequest) -> dict:
    """
    Build a 2-3 sentence caregiver summary of today's conversations.

    Returns:
        { summary: str, generatedAt: ISO timestamp }
    """
    try:
        chat_col = await get_chat_collection()

        now = datetime.now(timezone.utc)
        today_str = now.strftime("%Y-%m-%d")

        # Fetch today's messages for this elder
        start_of_day = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)

        today_docs = await chat_col.find(
            {
                "userId":    request.elderId,
                "timestamp": {"$gte": start_of_day},
            },
            {"role": 1, "content": 1},
        ).sort("timestamp", 1).to_list(length=200)

        # Filter to user messages only for context
        user_messages = [d["content"] for d in today_docs if d.get("role") == "user"]

        # Need at least 1 user message to generate a meaningful summary
        if len(user_messages) < 1:
            return {
                "summary":     "No conversations yet today.",
                "generatedAt": now.isoformat(),
            }

        # Gather last 10 messages (both sides) for richer context
        all_messages = [d["content"] for d in today_docs[-10:]]

        # Generate using Gemini (or stub fallback)
        summary_text = await generate_caregiver_summary(
            elder_name="the elder",
            messages_context=all_messages,
        )

        return {
            "summary":     summary_text,
            "generatedAt": now.isoformat(),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "❌  Summary error for elder %s: %s",
            request.elderId,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate summary.",
        ) from exc
