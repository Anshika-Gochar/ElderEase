"""
ai-service/main.py  MODIFY
---------------------------
FastAPI entry point: registers routers, CORS, lifespan hooks,
health endpoint, /ready endpoint, and /debug/gemini-test endpoint.
"""

import sys, io
# Force UTF-8 output on Windows consoles that default to CP1252
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import chat, mood, anomaly
from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown hooks
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events for the FastAPI application."""
    # ── Startup ──────────────────────────────────────────────────────────────
    banner = """
    +===========================================+
    |   ElderEase AI Service  v1.0.0           |
    |   Companion | Mood | Anomaly Detection    |
    +===========================================+
    """
    print(banner)
    print("[AI Service] ElderEase AI Service is starting up...")
    print("   - /chat    : Saathi companion chat (Gemini 1.5 Flash)")
    print("   - /mood    : VADER sentiment analysis")
    print("   - /anomaly : anomaly detection")
    print("   - /health  : health-check endpoint")
    print("   - /ready   : readiness check (Gemini + MongoDB status)")
    print("   - /debug/gemini-test : quick end-to-end Gemini verification")
    print()

    # Structured startup log — visible in both console and log aggregators
    logger.info("ElderEase AI Service starting...")
    logger.info("Gemini available: %s", settings.gemini_available)
    logger.info("MongoDB URI set: %s", bool(settings.MONGODB_URI))

    if settings.gemini_available:
        print("[AI Service] Gemini API key detected -- real AI responses enabled.")
        print(f"[AI Service] Model: {settings.GEMINI_MODEL}")
    else:
        print("[AI Service] STUB_MODE active -- warm mock responses will be returned.")
        print("             Set GEMINI_API_KEY and STUB_MODE=false to enable Gemini.")
    print()

    yield  # application runs here

    # -- Shutdown
    print("[AI Service] ElderEase AI Service is shutting down...")


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ElderEase AI Service",
    description=(
        "AI microservice powering the ElderEase elderly companion platform. "
        "Provides conversational AI (Saathi), mood tracking via VADER sentiment "
        "analysis, and anomaly detection."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow requests from Node backend and both React apps
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",   # Node.js Express backend
        "http://localhost:5173",   # Elder React app
        "http://localhost:5174",   # Caregiver React app
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(chat.router,    prefix="/chat",    tags=["chat"])
app.include_router(mood.router,    prefix="/mood",    tags=["mood"])
app.include_router(anomaly.router, prefix="/anomaly", tags=["anomaly"])

# ---------------------------------------------------------------------------
# Root / Health
# ---------------------------------------------------------------------------


@app.get("/", tags=["meta"])
async def root():
    """Root endpoint — points to docs."""
    return {
        "message": "ElderEase AI Service is running 🌿",
        "docs":    "/docs",
        "health":  "/health",
        "ready":   "/ready",
    }


@app.get("/health", tags=["meta"])
async def health_check():
    """
    Basic health-check endpoint — always returns 200 if the process is alive.

    Returns:
        dict: Service status, name, and version.
    """
    return {"status": "ok", "service": "ai", "version": "1.0.0"}


@app.get("/ready", tags=["meta"])
async def readiness_check():
    """
    Readiness endpoint — reports Gemini and MongoDB connectivity.

    Use this to verify the AI service state at a glance:
      - gemini: true if GEMINI_API_KEY is set and STUB_MODE=false
      - mongodb: true if Motor can ping the database within 3 seconds

    Returns:
        dict with keys: status, gemini (bool), mongodb (bool)
    """
    gemini_ready = settings.gemini_available

    # Quick Motor ping
    mongodb_ready = False
    try:
        from app.database import get_database
        db = await get_database()
        await db.command("ping")
        mongodb_ready = True
    except Exception:  # noqa: BLE001
        mongodb_ready = False

    return {
        "status":  "ok",
        "gemini":  gemini_ready,
        "mongodb": mongodb_ready,
    }


# ---------------------------------------------------------------------------
# Debug endpoint — /debug/gemini-test
# ---------------------------------------------------------------------------


@app.get("/debug/gemini-test", tags=["debug"])
async def gemini_test():
    """
    End-to-end Gemini verification endpoint (no auth required).

    Sends a fixed health-complaint message through the full generate_response
    pipeline and reports whether real Gemini or the stub was used.

    Returns:
        {
          "response":    str,   # The actual text returned by Saathi
          "gemini_used": bool,  # True when Gemini (not stub) answered
          "model":       str    # Model name from config
        }

    Example:
        curl http://localhost:8000/debug/gemini-test
    """
    from app.services.gemini_chat import generate_response

    test_message = "Hello, I have a headache today"
    test_elder_id = "test"

    logger.info(
        "🔍  /debug/gemini-test called — gemini_available: %s",
        settings.gemini_available,
    )

    response_text = await generate_response(
        elderId=test_elder_id,
        message=test_message,
        history=[],
    )

    logger.info(
        "🔍  /debug/gemini-test response: %s…",
        response_text[:100],
    )

    return {
        "response":    response_text,
        "gemini_used": settings.gemini_available,
        "model":       settings.GEMINI_MODEL,
    }
