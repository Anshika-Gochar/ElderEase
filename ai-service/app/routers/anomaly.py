"""
ai-service/app/routers/anomaly.py  MODIFY
──────────────────────────────────────────
Phase 4 anomaly router — /anomaly

Endpoints:
    POST /detect               → Fetch real stats, run detector, persist AnomalyFlag docs.
    GET  /{elder_id}           → Return unresolved + recently resolved anomaly flags.
    PATCH /{anomaly_id}/resolve → Mark an AnomalyFlag as resolved.

Legacy Phase 3 endpoint (kept intact):
    POST /detect  — still accepts old AnomalyRequest shape via query-param flag.
    (The Phase 4 shape only needs { elderId } in the body.)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, HTTPException

from app.database import get_anomaly_collection, get_database
from app.models.schemas import AnomalyDetectRequest, AnomalyRequest, AnomalyResponse
from app.services.anomaly_detector import detect, detect_anomaly

logger = logging.getLogger(__name__)

router = APIRouter(tags=["anomaly"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _days_ago(n: int) -> datetime:
    return _utc_now() - timedelta(days=n)


def _serialize(doc: dict) -> dict:
    """Convert MongoDB ObjectId fields to strings for JSON serialisation."""
    out = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
# POST /anomaly/detect  — Phase 4 (real data pipeline)
# ---------------------------------------------------------------------------


@router.post(
    "/detect",
    summary="Run anomaly detection for an elder (Phase 4 — real data)",
)
async def detect_for_elder(request: AnomalyDetectRequest) -> dict:
    """
    Full Phase 4 anomaly detection pipeline:

    1. Fetch 7-day stats from MongoDB (missed doses, chat sessions,
       avg mood, task completion rate, SOS events).
    2. Call anomaly_detector.detect() which builds a 30-day feature
       matrix, fits IsolationForest (if enough data), and applies rules.
    3. For each triggered anomaly: insert AnomalyFlag doc if no
       unresolved flag of the same type already exists (deduplication).
    4. Return the list of anomalies and the raw stats payload.

    Args:
        request: AnomalyDetectRequest with elderId field.

    Returns:
        { anomalies: [...], payload: {...stats...} }

    Raises:
        HTTPException 400: If elderId is not a valid ObjectId.
        HTTPException 500: On database or detection errors.
    """
    elder_id_str = request.elderId

    # Validate ObjectId format
    try:
        elder_obj_id = ObjectId(elder_id_str)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid elderId: {elder_id_str}")

    try:
        db = await get_database()
        since_7d = _days_ago(7)

        # ── 1a. missedDosesLast7Days ────────────────────────────────────────
        missed_count = await db["doselogs"].count_documents({
            "elderId":       elder_obj_id,
            "status":        "missed",
            "scheduledTime": {"$gte": since_7d},
        })

        # ── 1b. chatSessionsLast7Days (unique chat days) ────────────────────
        # Count distinct calendar days on which the elder sent a message
        chat_days_pipeline = [
            {
                "$match": {
                    "userId":    elder_id_str,
                    "role":      "user",
                    "timestamp": {"$gte": since_7d},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}
                    }
                }
            },
            {"$count": "total"},
        ]
        chat_days_result = await db["chat_messages"].aggregate(
            chat_days_pipeline
        ).to_list(length=1)
        chat_sessions = chat_days_result[0]["total"] if chat_days_result else 0

        # ── 1c. avgMoodLast7Days ────────────────────────────────────────────
        mood_pipeline = [
            {
                "$match": {
                    "userId": elder_id_str,
                    "date":   {"$gte": since_7d.strftime("%Y-%m-%d")},
                }
            },
            {"$group": {"_id": None, "avgScore": {"$avg": "$score"}}},
        ]
        mood_result = await db["mood_scores"].aggregate(mood_pipeline).to_list(length=1)
        avg_mood: float | None = (
            round(mood_result[0]["avgScore"], 2) if mood_result else None
        )

        # ── 1d. taskCompletionRateLast7Days ─────────────────────────────────
        # Total active tasks for this elder
        total_tasks = await db["tasks"].count_documents({
            "elderId":  elder_obj_id,
            "isActive": True,
        })

        if total_tasks > 0:
            # Count completions in last 7 days
            completed_count = await db["taskcompletions"].count_documents({
                "elderId":    elder_obj_id,
                "completedAt": {"$gte": since_7d},
            })
            # Max possible = total_tasks × 7 days
            max_possible = total_tasks * 7
            task_completion_rate = round(completed_count / max_possible, 4)
        else:
            # No tasks defined → not an anomaly
            task_completion_rate = 1.0

        # ── 1e. sosEventsLast7Days ──────────────────────────────────────────
        # SOS events are not currently written to MongoDB (Phase 3 only
        # emits socket + Twilio stub). Default to 0 until SOS logging is
        # added in a future phase. The sos_triggered rule therefore never
        # fires from this field — it is a safe conservative default.
        sos_events = 0

        payload = {
            "missedDosesLast7Days":        missed_count,
            "chatSessionsLast7Days":       chat_sessions,
            "avgMoodLast7Days":            avg_mood,
            "taskCompletionRateLast7Days": task_completion_rate,
            "sosEventsLast7Days":          sos_events,
        }

        logger.info("[AnomalyRouter] Stats for elder %s: %s", elder_id_str, payload)

        # ── 2. Run detection ────────────────────────────────────────────────
        anomalies = await detect(elder_id_str, payload)

        # ── 3. Persist new AnomalyFlag docs (deduplicated) ─────────────────
        anomaly_col = await get_anomaly_collection()
        persisted: list[dict] = []

        for anomaly in anomalies:
            anomaly_type = anomaly["type"]

            # Check for an existing unresolved flag of the same type
            existing = await anomaly_col.find_one({
                "elderId":    elder_id_str,
                "type":       anomaly_type,
                "resolvedAt": None,
            })

            if existing:
                logger.info(
                    "[AnomalyRouter] Skipping duplicate flag type=%s for elder %s",
                    anomaly_type, elder_id_str,
                )
                persisted.append(_serialize({**existing, "_id": str(existing["_id"])}))
                continue

            doc = {
                "elderId":             elder_id_str,
                "type":                anomaly_type,
                "severity":            anomaly["severity"],
                "details":             anomaly["details"],
                "notifiedCaregivers":  [],
                "resolvedAt":          None,
                "createdAt":           _utc_now(),
            }
            result = await anomaly_col.insert_one(doc)
            doc["_id"] = str(result.inserted_id)
            persisted.append(_serialize(doc))
            logger.warning(
                "[AnomalyRouter] Persisted new AnomalyFlag type=%s severity=%s for elder %s",
                anomaly_type, anomaly["severity"], elder_id_str,
            )

        return {"anomalies": persisted, "payload": payload}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "[AnomalyRouter] Detection pipeline error for elder %s: %s",
            elder_id_str, exc, exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Anomaly detection failed.") from exc


# ---------------------------------------------------------------------------
# GET /anomaly/{elder_id}  — unresolved + recently resolved
# ---------------------------------------------------------------------------


@router.get(
    "/{elder_id}",
    summary="Get anomaly flags for an elder",
)
async def get_anomaly_flags(elder_id: str) -> dict:
    """
    Return all unresolved AnomalyFlag docs for this elder plus any that
    were resolved within the past 7 days (for historical context).

    Results are sorted newest-first.

    Args:
        elder_id: String MongoDB _id of the elder.

    Returns:
        { elderId, flags: [...], count }

    Raises:
        HTTPException 500: On database errors.
    """
    try:
        anomaly_col = await get_anomaly_collection()
        since_7d_str = _days_ago(7).isoformat()

        flags_cursor = anomaly_col.find(
            {
                "elderId": elder_id,
                "$or": [
                    {"resolvedAt": None},
                    {"resolvedAt": {"$gte": since_7d_str}},
                ],
            },
            {"userId": 0},    # exclude legacy userId field
        ).sort("createdAt", -1).limit(50)

        flags = []
        async for doc in flags_cursor:
            flags.append(_serialize(doc))

        return {"elderId": elder_id, "flags": flags, "count": len(flags)}

    except Exception as exc:
        logger.error(
            "[AnomalyRouter] Flags fetch error for elder %s: %s",
            elder_id, exc, exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch anomaly flags.") from exc


# ---------------------------------------------------------------------------
# PATCH /anomaly/{anomaly_id}/resolve
# ---------------------------------------------------------------------------


@router.patch(
    "/{anomaly_id}/resolve",
    summary="Mark an AnomalyFlag as resolved",
)
async def resolve_anomaly_flag(anomaly_id: str) -> dict:
    """
    Set resolvedAt = now on the AnomalyFlag document.

    Args:
        anomaly_id: String representation of the AnomalyFlag _id.

    Returns:
        { success: true, resolvedAt: ISO timestamp }

    Raises:
        HTTPException 400: If anomaly_id is not a valid ObjectId.
        HTTPException 404: If the flag is not found.
        HTTPException 500: On database errors.
    """
    try:
        flag_obj_id = ObjectId(anomaly_id)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid anomaly_id: {anomaly_id}")

    try:
        anomaly_col = await get_anomaly_collection()
        resolved_at = _utc_now()

        result = await anomaly_col.update_one(
            {"_id": flag_obj_id},
            {"$set": {"resolvedAt": resolved_at.isoformat()}},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Anomaly flag not found.")

        logger.info("[AnomalyRouter] Resolved AnomalyFlag %s at %s", anomaly_id, resolved_at)

        return {"success": True, "anomalyId": anomaly_id, "resolvedAt": resolved_at.isoformat()}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "[AnomalyRouter] Resolve error for flag %s: %s", anomaly_id, exc, exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to resolve anomaly flag.") from exc


# ---------------------------------------------------------------------------
# Legacy Phase 3 endpoint — kept for backwards compatibility
# (The Phase 3 router used a different request schema)
# ---------------------------------------------------------------------------

@router.post(
    "/detect/legacy",
    response_model=AnomalyResponse,
    summary="[Legacy Phase 3] Anomaly detection with explicit feature vector",
    include_in_schema=False,   # hide from Swagger docs
)
async def detect_legacy(request: AnomalyRequest) -> AnomalyResponse:
    """
    Phase 3 backwards-compatible anomaly detection endpoint.
    Accepts the old feature-vector request shape and uses the synchronous
    IsolationForest baseline. Kept so Phase 3 tests continue to pass.
    """
    try:
        result = detect_anomaly({
            "missedDoses7d":   request.missedDoses7d,
            "chatFrequency7d": request.chatFrequency7d,
            "avgResponseMs":   request.avgResponseMs or 0.0,
            "moodScores7d":    request.moodScores7d or [],
        })

        if result["isAnomaly"]:
            try:
                col = await get_anomaly_collection()
                await col.insert_one({
                    "userId":     request.userId,
                    "isAnomaly":  result["isAnomaly"],
                    "score":      result["score"],
                    "severity":   result["severity"],
                    "details":    result["details"],
                    "detectedAt": _utc_now(),
                })
            except Exception as db_exc:
                logger.error("Failed to persist legacy anomaly flag: %s", db_exc)

        return AnomalyResponse(
            userId=request.userId,
            isAnomaly=result["isAnomaly"],
            score=result["score"],
            severity=result["severity"],
            details=result["details"],
        )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Anomaly detection failed.") from exc
