"""
app/models/schemas.py
─────────────────────
Pydantic v2 request/response models for all AI service endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    """Incoming request body for the /chat endpoint."""

    userId: str = Field(..., description="Unique identifier of the elder user.")
    message: str = Field(..., min_length=1, max_length=2000, description="User's message text.")
    elderName: Optional[str] = Field(default="Friend", description="Elder's preferred name for personalised responses.")


class ChatResponse(BaseModel):
    """Response body returned by the /chat endpoint."""

    response: str = Field(..., description="AI companion's reply.")
    userId: str = Field(..., description="Echoed userId from the request.")
    timestamp: datetime = Field(..., description="UTC timestamp when the response was generated.")
    isStub: bool = Field(default=False, description="True when the response comes from the stub/mock layer.")


# ---------------------------------------------------------------------------
# Mood
# ---------------------------------------------------------------------------


class MoodAnalyzeRequest(BaseModel):
    """Request body for POST /mood — analyzes a batch of messages for one day."""

    userId: str = Field(..., description="Unique identifier of the elder user.")
    messages: List[str] = Field(..., description="List of message texts to analyse for the given day.")
    date: Optional[str] = Field(default=None, description="Date in YYYY-MM-DD format. Defaults to today (UTC) if omitted.")


class MoodScore(BaseModel):
    """A single day's mood score for one user."""

    userId: str = Field(..., description="User this score belongs to.")
    date: str = Field(..., description="Date of this score in YYYY-MM-DD format.")
    score: float = Field(..., ge=0, le=10, description="Normalised mood score from 0 (very negative) to 10 (very positive).")
    rawSentiment: float = Field(default=0.0, ge=-1, le=1, description="Average VADER compound sentiment score across all messages.")
    messageCount: int = Field(default=0, ge=0, description="Number of messages analysed.")
    sentimentLabel: Optional[str] = Field(default=None, description="Human label: 'positive' | 'neutral' | 'negative'.")


class MoodHistoryResponse(BaseModel):
    """Response body for mood history queries."""

    userId: str
    scores: List[MoodScore]


# ---------------------------------------------------------------------------
# Anomaly
# ---------------------------------------------------------------------------


class AnomalyRequest(BaseModel):
    """Feature vector for the legacy anomaly detection endpoint (Phase 3)."""

    userId: str = Field(..., description="Unique identifier of the elder user.")
    missedDoses7d: int = Field(..., ge=0, description="Number of medication doses missed in the past 7 days.")
    chatFrequency7d: int = Field(..., ge=0, description="Number of chat interactions in the past 7 days.")
    avgResponseMs: Optional[float] = Field(default=0.0, ge=0, description="Average chat response latency in milliseconds.")
    moodScores7d: Optional[List[float]] = Field(default=[], description="List of daily mood scores (0-10) for the past 7 days.")


class AnomalyDetectRequest(BaseModel):
    """Request body for Phase 4 POST /anomaly/detect — only needs elderId."""

    elderId: str = Field(..., description="MongoDB _id of the elder to analyse.")


class AnomalyFlag(BaseModel):
    """A single persisted anomaly flag document."""

    id: Optional[str] = Field(default=None, alias="_id")
    elderId: str
    type: str
    severity: str
    details: dict
    resolvedAt: Optional[str] = Field(default=None)
    createdAt: Optional[str] = Field(default=None)

    class Config:
        populate_by_name = True


class AnomalyResponse(BaseModel):
    """Result of anomaly detection for one user."""

    userId: str
    isAnomaly: bool = Field(..., description="True when the model flags the user's behaviour as anomalous.")
    score: float = Field(..., description="Anomaly score from IsolationForest (more negative = more anomalous).")
    severity: str = Field(..., description="Human-readable severity: 'low', 'medium', or 'high'.")
    details: dict = Field(..., description="Breakdown of individual feature contributions to the flag.")


# ---------------------------------------------------------------------------
# Caregiver Summary
# ---------------------------------------------------------------------------


class SummaryRequest(BaseModel):
    """Request body for generating a caregiver daily digest."""

    elderId: str = Field(..., description="Unique identifier of the elder.")
    elderName: Optional[str] = Field(default="Friend", description="Display name of the elder.")
    moodScores: Optional[List[float]] = Field(default=[], description="List of recent daily mood scores (0-10).")
    missedDoses: Optional[int] = Field(default=0, ge=0, description="Number of missed medication doses in the period.")
    tasksCompleted: Optional[int] = Field(default=0, ge=0, description="Number of tasks completed.")
    totalTasks: Optional[int] = Field(default=0, ge=0, description="Total number of tasks in the period.")
    recentMessages: Optional[List[str]] = Field(default=[], description="Sample of recent chat messages for tone context.")


class SummaryResponse(BaseModel):
    """Caregiver daily digest response."""

    summary: str = Field(..., description="Narrative summary text for the caregiver.")
    elderId: str
    generatedAt: datetime = Field(..., description="UTC timestamp of generation.")
    isStub: bool = Field(default=False, description="True when stub/templated summary was used.")
