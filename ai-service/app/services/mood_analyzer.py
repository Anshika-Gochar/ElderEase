"""
app/services/mood_analyzer.py
──────────────────────────────
VADER-based sentiment analysis service.

VADER (Valence Aware Dictionary and sEntiment Reasoner) is rule-based and
requires no training data — ideal for short conversational messages from
elderly users which may include informal phrasing, abbreviations, and emojis.
"""

from __future__ import annotations

import logging

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level analyser singleton — SentimentIntensityAnalyzer is thread-safe
# and loading it once avoids repeated lexicon I/O on every request.
# ---------------------------------------------------------------------------

analyzer = SentimentIntensityAnalyzer()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def analyze_messages(messages: list[str]) -> dict:
    """
    Analyse a list of messages using VADER sentiment analysis.

    Each message is scored individually using VADER's ``polarity_scores``
    method which returns a compound score in [-1, 1]. The compound scores
    are averaged and then normalised to a user-friendly 0–10 scale.

    Scoring interpretation:
        - compound < -0.05  → negative sentiment
        - compound > +0.05  → positive sentiment
        - otherwise          → neutral

    Normalisation formula:
        score = (avg_compound + 1) × 5
        This maps [-1, 1] → [0, 10] linearly.

    Args:
        messages: List of chat message strings to analyse.
                  Empty lists return a neutral baseline score of 5.0.

    Returns:
        dict with keys:
            score (float):         Normalised mood score 0–10.
            rawSentiment (float):  Average VADER compound score (-1 to 1).
            messageCount (int):    Number of messages analysed.
            breakdown (dict):      Per-message raw scores for debugging.
    """
    if not messages:
        logger.debug("📊  No messages provided — returning neutral baseline score.")
        return {
            "score": 5.0,
            "rawSentiment": 0.0,
            "messageCount": 0,
            "breakdown": [],
        }

    scores: list[float] = []
    breakdown: list[dict] = []

    for msg in messages:
        if not msg or not msg.strip():
            continue  # skip blank entries

        polarity = analyzer.polarity_scores(msg)
        compound = polarity["compound"]
        scores.append(compound)
        breakdown.append({
            "text": msg[:80],          # truncate for storage
            "compound": compound,
            "pos": polarity["pos"],
            "neu": polarity["neu"],
            "neg": polarity["neg"],
        })

    if not scores:
        logger.debug("📊  All messages were blank — returning neutral baseline.")
        return {
            "score": 5.0,
            "rawSentiment": 0.0,
            "messageCount": len(messages),
            "breakdown": [],
        }

    avg_compound = sum(scores) / len(scores)

    # Normalise [-1, 1] → [0, 10]
    normalized = (avg_compound + 1) * 5

    result = {
        "score": round(normalized, 2),
        "rawSentiment": round(avg_compound, 4),
        "messageCount": len(messages),
        "breakdown": breakdown,
    }

    logger.debug(
        "📊  Mood analysis complete: %d messages, avg compound=%.4f, score=%.2f",
        len(messages),
        avg_compound,
        normalized,
    )
    return result


def get_mood_label(score: float) -> str:
    """
    Convert a numeric mood score to a human-readable label.

    Args:
        score: Mood score in range [0, 10].

    Returns:
        One of: 'Very Low', 'Low', 'Neutral', 'Good', 'Excellent'.
    """
    if score < 2:
        return "Very Low"
    if score < 4:
        return "Low"
    if score < 6:
        return "Neutral"
    if score < 8:
        return "Good"
    return "Excellent"


def rolling_average(scores: list[float], window: int = 7) -> float:
    """
    Compute a rolling average over the last ``window`` scores.

    Args:
        scores: List of daily mood scores (ordered oldest→newest).
        window: Number of most-recent scores to include.

    Returns:
        Rolling average as a float, or 5.0 if the list is empty.
    """
    if not scores:
        return 5.0
    recent = scores[-window:]
    return round(sum(recent) / len(recent), 2)
