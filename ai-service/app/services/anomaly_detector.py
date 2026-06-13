"""
ai-service/app/services/anomaly_detector.py  MODIFY
─────────────────────────────────────────────────────
Phase 4: IsolationForest anomaly detection using real elder data from MongoDB.

Feature vector (4 dimensions per day):
    [mood_score, chat_count, missed_doses, task_completion_rate]

If fewer than 7 days of real data exist the model skips IsolationForest
entirely and relies on rule overrides only (cold-start safety).

Rule overrides are always applied on top of the ML score.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import numpy as np
from bson import ObjectId
from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Rule definitions
# ---------------------------------------------------------------------------

# Each rule: (field_key, operator, threshold, severity, anomaly_type)
_RULES = [
    ("missedDosesLast7Days",          "gte", 5,   "high",   "medication_non_adherence"),
    ("avgMoodLast7Days",              "lt",  3.0, "high",   "severe_low_mood"),
    ("chatSessionsLast7Days",         "lt",  2,   "medium", "social_withdrawal"),
    ("sosEventsLast7Days",            "gt",  0,   "high",   "sos_triggered"),
    ("taskCompletionRateLast7Days",   "lt",  0.3, "medium", "low_task_completion"),
]


def _apply_rules(payload: dict[str, Any], iso_score: float) -> list[dict[str, Any]]:
    """
    Apply rule-based overrides to the payload stats.

    Args:
        payload: Dict of pre-fetched stats for the elder.
        iso_score: IsolationForest decision score (or 0.0 if not run).

    Returns:
        List of triggered anomaly dicts, each with type/severity/details/score.
    """
    anomalies: list[dict[str, Any]] = []

    for field, op, threshold, severity, anomaly_type in _RULES:
        value = payload.get(field)

        # Skip rules where the field is None (e.g. avgMood with no data)
        if value is None:
            continue

        triggered = False
        if op == "gte" and value >= threshold:
            triggered = True
        elif op == "gt" and value > threshold:
            triggered = True
        elif op == "lt" and value < threshold:
            triggered = True

        if triggered:
            anomalies.append({
                "type":     anomaly_type,
                "severity": severity,
                "details":  {**payload, "triggeredField": field, "fieldValue": value},
                "score":    round(iso_score, 6),
            })
            logger.warning(
                "[AnomalyDetector] Rule triggered: %s (field=%s, value=%s, threshold=%s)",
                anomaly_type, field, value, threshold,
            )

    return anomalies


# ---------------------------------------------------------------------------
# Feature matrix builder
# ---------------------------------------------------------------------------

async def _build_feature_matrix(
    elder_id_str: str,
    days: int = 30,
) -> list[list[float]]:
    """
    Build a (days × 4) feature matrix from real MongoDB data.

    Columns per row (one row = one calendar day):
        [mood_score, chat_count, missed_doses, task_completion_rate]

    Days with no data in a given collection are filled with safe defaults:
        - mood_score          → 5.0 (neutral)
        - chat_count          → 0
        - missed_doses        → 0
        - task_completion_rate → 1.0 (no tasks = no failure)

    Args:
        elder_id_str: String representation of the elder's MongoDB _id.
        days: Number of past calendar days to include.

    Returns:
        List of [mood, chat, doses, task_rate] rows (oldest first).
    """
    from app.database import get_database

    db = await get_database()
    now = datetime.now(timezone.utc)

    # Build list of date strings for the window
    date_strings = [
        (now - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(days - 1, -1, -1)   # oldest → newest
    ]

    # ── Mood scores (keyed by date) ─────────────────────────────────────────
    mood_cursor = db["mood_scores"].find(
        {"userId": elder_id_str},
        {"_id": 0, "date": 1, "score": 1},
    ).sort("date", 1).limit(days)
    mood_by_date: dict[str, float] = {
        doc["date"]: doc["score"]
        async for doc in mood_cursor
    }

    # ── Chat messages: count per day ─────────────────────────────────────────
    # chat_messages stores userId as a string
    try:
        elder_obj_id = ObjectId(elder_id_str)
    except Exception:
        elder_obj_id = None

    since = now - timedelta(days=days)

    chat_pipeline = [
        {
            "$match": {
                "userId": elder_id_str,
                "role": "user",                  # only count elder's own messages
                "timestamp": {"$gte": since},
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}
                },
                "count": {"$sum": 1},
            }
        },
    ]
    chat_by_date: dict[str, int] = {}
    async for doc in db["chat_messages"].aggregate(chat_pipeline):
        chat_by_date[doc["_id"]] = doc["count"]

    # ── Missed doses: count per day ─────────────────────────────────────────
    # dose_logs uses elderId as ObjectId
    missed_pipeline: list[dict] = []
    if elder_obj_id:
        missed_pipeline = [
            {
                "$match": {
                    "elderId": elder_obj_id,
                    "status": "missed",
                    "scheduledTime": {"$gte": since},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$scheduledTime",
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
        ]
    missed_by_date: dict[str, int] = {}
    if missed_pipeline:
        async for doc in db["doselogs"].aggregate(missed_pipeline):
            missed_by_date[doc["_id"]] = doc["count"]

    # ── Task completion rate per day ─────────────────────────────────────────
    # task_completions uses elderId as ObjectId
    task_complete_pipeline: list[dict] = []
    if elder_obj_id:
        task_complete_pipeline = [
            {
                "$match": {
                    "elderId": elder_obj_id,
                    "completedAt": {"$gte": since},
                }
            },
            {
                "$group": {
                    "_id": "$date",   # stored as YYYY-MM-DD string in TaskCompletion
                    "completed": {"$sum": 1},
                }
            },
        ]
    completed_by_date: dict[str, int] = {}
    if task_complete_pipeline:
        async for doc in db["taskcompletions"].aggregate(task_complete_pipeline):
            completed_by_date[doc["_id"]] = doc["completed"]

    # Total active tasks for completion rate denominator (count active tasks for elder)
    total_tasks = 0
    if elder_obj_id:
        total_tasks = await db["tasks"].count_documents(
            {"elderId": elder_obj_id, "isActive": True}
        )

    # ── Assemble feature matrix ─────────────────────────────────────────────
    rows: list[list[float]] = []
    for date_str in date_strings:
        mood   = float(mood_by_date.get(date_str, 5.0))
        chat   = float(chat_by_date.get(date_str, 0))
        missed = float(missed_by_date.get(date_str, 0))
        comp   = float(completed_by_date.get(date_str, 0))
        rate   = (comp / total_tasks) if total_tasks > 0 else 1.0
        rows.append([mood, chat, missed, rate])

    return rows


# ---------------------------------------------------------------------------
# Public async detection API
# ---------------------------------------------------------------------------

async def detect(elder_id_str: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Run anomaly detection for one elder using real MongoDB data.

    Steps:
        1. Fetch 30-day feature matrix from MongoDB.
        2. If >= 7 days of real data: fit IsolationForest and score today.
           If < 7 days: skip ML, use rules only (cold-start safety).
        3. Apply rule-based overrides on top.
        4. Return list of triggered anomaly dicts (empty = no anomalies).

    Args:
        elder_id_str: String MongoDB _id of the elder.
        payload: Pre-fetched 7-day stats dict with keys:
            missedDosesLast7Days, chatSessionsLast7Days,
            avgMoodLast7Days, taskCompletionRateLast7Days,
            sosEventsLast7Days.

    Returns:
        List of anomaly dicts. Each dict has: type, severity, details, score.
        Returns empty list when no anomalies are detected.
    """
    iso_score = 0.0

    try:
        feature_matrix = await _build_feature_matrix(elder_id_str, days=30)
        real_days = len([row for row in feature_matrix if row[1] > 0 or row[0] != 5.0])

        logger.info(
            "[AnomalyDetector] Elder %s: %d days in matrix, %d with real data",
            elder_id_str, len(feature_matrix), real_days,
        )

        if real_days >= 7 and len(feature_matrix) >= 7:
            # ── IsolationForest path ────────────────────────────────────────
            X = np.array(feature_matrix, dtype=float)

            model = IsolationForest(
                n_estimators=100,
                contamination=0.10,
                random_state=42,
                max_samples="auto",
            )
            model.fit(X)

            # Score today's vector (last row in the matrix)
            today_vector = X[-1].reshape(1, -1)
            iso_score = float(model.score_samples(today_vector)[0])
            iso_prediction = int(model.predict(today_vector)[0])   # 1=normal, -1=anomaly

            logger.info(
                "[AnomalyDetector] IsolationForest score=%.4f, prediction=%s",
                iso_score, "anomaly" if iso_prediction == -1 else "normal",
            )

            # If IsolationForest flags it but no rule matches,
            # add a generic ML-detected entry
            rule_anomalies = _apply_rules(payload, iso_score)
            if iso_prediction == -1 and not rule_anomalies:
                severity = (
                    "high"   if iso_score < -0.15 else
                    "medium" if iso_score < -0.08 else
                    "low"
                )
                rule_anomalies.append({
                    "type":     "ml_detected_anomaly",
                    "severity": severity,
                    "details":  {
                        **payload,
                        "isoForestScore": round(iso_score, 6),
                        "note": "IsolationForest detected unusual pattern without matching a named rule",
                    },
                    "score": round(iso_score, 6),
                })
            return rule_anomalies

        else:
            # ── Cold-start: rule-only path ──────────────────────────────────
            logger.info(
                "[AnomalyDetector] Cold-start for elder %s (only %d real days) "
                "— using rule-based detection only.",
                elder_id_str, real_days,
            )
            return _apply_rules(payload, iso_score)

    except Exception as exc:
        logger.error(
            "[AnomalyDetector] Error building feature matrix for elder %s: %s",
            elder_id_str, exc, exc_info=True,
        )
        # Fall back to pure rules if matrix building fails
        return _apply_rules(payload, 0.0)


# ---------------------------------------------------------------------------
# Legacy sync API — kept for backwards compatibility with Phase 3 router
# ---------------------------------------------------------------------------

def _HEALTHY_DATA() -> list[list[float]]:
    """30 rows of synthetic healthy-elder data for the legacy endpoint."""
    return [
        [7.5, 14, 0, 1.0], [7.0, 12, 1, 0.9], [8.0, 15, 0, 1.0],
        [6.5, 10, 1, 0.8], [7.8, 13, 0, 1.0], [6.8, 11, 2, 0.7],
        [7.9, 14, 0, 1.0], [7.2, 12, 1, 0.9], [8.1, 16, 0, 1.0],
        [6.9, 11, 1, 0.8], [7.5, 13, 0, 1.0], [6.6, 10, 2, 0.7],
        [7.7, 15, 0, 1.0], [7.3, 14, 1, 0.9], [7.6, 12, 0, 1.0],
        [7.1, 13, 1, 0.9], [6.7, 11, 2, 0.7], [8.2, 15, 0, 1.0],
        [7.0, 12, 1, 0.9], [7.8, 14, 0, 1.0], [6.4, 10, 1, 0.8],
        [7.6, 13, 0, 1.0], [6.9, 12, 2, 0.7], [8.0, 14, 0, 1.0],
        [7.0, 11, 1, 0.9], [7.7, 15, 0, 1.0], [7.2, 13, 1, 0.9],
        [7.5, 12, 0, 1.0], [7.3, 14, 1, 0.9], [7.6, 13, 0, 1.0],
    ]


_legacy_model: IsolationForest | None = None


def _get_legacy_model() -> IsolationForest:
    global _legacy_model
    if _legacy_model is None:
        X = np.array(_HEALTHY_DATA(), dtype=float)
        _legacy_model = IsolationForest(n_estimators=100, contamination=0.10, random_state=42)
        _legacy_model.fit(X)
    return _legacy_model


def detect_anomaly(features: dict[str, Any]) -> dict[str, Any]:
    """
    Legacy synchronous anomaly detection (Phase 3 /anomaly/detect endpoint).
    Kept intact so Phase 3 router continues to work without changes.
    """
    missed_doses = int(features.get("missedDoses7d", 0))
    chat_freq    = int(features.get("chatFrequency7d", 0))
    avg_resp_ms  = float(features.get("avgResponseMs", 0) or 0)
    mood_scores  = features.get("moodScores7d", []) or []
    avg_mood     = round(sum(mood_scores) / len(mood_scores), 2) if mood_scores else 5.0

    feature_vector = np.array([[avg_mood, chat_freq, missed_doses, 1.0]], dtype=float)
    model = _get_legacy_model()
    iso_prediction = int(model.predict(feature_vector)[0])
    iso_score      = float(model.score_samples(feature_vector)[0])

    rule_triggers: list[str] = []
    rule_severity: str | None = None

    if missed_doses > 5:
        rule_triggers.append(f"missedDoses7d={missed_doses} exceeds threshold (>5)")
        rule_severity = "high"
    if chat_freq < 2:
        rule_triggers.append(f"chatFrequency7d={chat_freq} is critically low (<2)")
        rule_severity = rule_severity or "medium"
    if avg_mood < 3.0:
        rule_triggers.append(f"avgMoodScore={avg_mood} is very low (<3)")
        rule_severity = "high"
    if missed_doses > 3 and rule_severity != "high":
        rule_triggers.append(f"missedDoses7d={missed_doses} is elevated (>3)")
        rule_severity = rule_severity or "medium"
    if chat_freq < 5 and rule_severity is None:
        rule_triggers.append(f"chatFrequency7d={chat_freq} is below normal (<5)")
        rule_severity = "low"

    is_anomaly_ml   = iso_prediction == -1
    is_anomaly_rule = len(rule_triggers) > 0
    is_anomaly      = is_anomaly_ml or is_anomaly_rule

    if rule_severity:
        severity = rule_severity
    elif is_anomaly_ml:
        severity = "high" if iso_score < -0.15 else "medium" if iso_score < -0.08 else "low"
    else:
        severity = "low"

    return {
        "isAnomaly": is_anomaly,
        "score":     round(iso_score, 6),
        "severity":  severity,
        "details": {
            "missedDoses7d":   missed_doses,
            "chatFrequency7d": chat_freq,
            "avgResponseMs":   avg_resp_ms,
            "avgMoodScore":    avg_mood,
            "moodScoreCount":  len(mood_scores),
            "isoForestFlag":   is_anomaly_ml,
            "isoForestScore":  round(iso_score, 6),
            "ruleTriggers":    rule_triggers,
            "ruleOverride":    is_anomaly_rule,
        },
    }
