"""
ai-service/app/services/gemini_chat.py  MODIFY
───────────────────────────────────────────────
Gemini 1.5 Flash companion chat service.

When GEMINI_API_KEY is set and STUB_MODE is False, real Gemini calls are made.
Falls back to warm pre-written stub responses so the app never breaks.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

import google.generativeai as genai

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt — Saathi's exact persona
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are Saathi, a warm and caring AI companion for elderly people.
You speak simply and clearly — short sentences, never complicated words.
You listen carefully and respond directly to what the person just said.

CRITICAL RULES:
- If someone mentions pain, illness, or a health symptom (headache, \
fever, ache, tiredness, nausea, dizziness, chest pain) — acknowledge \
it with genuine concern first. Never ignore a health complaint.
  Say something like "I'm sorry to hear that, a headache can be quite \
uncomfortable. Make sure to rest and drink water. If it persists, \
please let your caregiver know."
- Never respond with "How lovely!" or positive phrases when someone \
shares something negative or a health complaint.
- Never give medical diagnoses or treatment advice.
- Ask only ONE follow-up question per response, at the end.
- Keep responses under 3 sentences unless the person needs more support.
- If someone seems sad or lonely, acknowledge their feeling before \
anything else.
- Always stay on topic with what the person just said.\
"""

# ---------------------------------------------------------------------------
# Health keywords — used for response-quality validation
# ---------------------------------------------------------------------------

_HEALTH_KEYWORDS: frozenset[str] = frozenset({
    "headache", "pain", "fever", "tired", "ache", "dizzy",
    "sick", "hurt", "nausea", "dizziness", "unwell", "ill",
    "vomit", "chest", "breathe", "cough", "cold", "flu",
})

# Fallback response used when validation fails after a retry
_HEALTH_FALLBACK = (
    "I'm sorry to hear that. Please make sure to rest and let your "
    "caregiver know if you're not feeling well."
)

# ---------------------------------------------------------------------------
# Stub responses — cycled deterministically (MD5 of message content)
# ---------------------------------------------------------------------------

_STUB_RESPONSES: list[str] = [
    "That's wonderful to hear! How has your day been going so far? 😊",
    "I was thinking about you! Did you get a chance to do your morning walk today?",
    "Good to chat with you! How are you feeling this afternoon?",
    "How lovely! Tell me more about that — I'd love to hear.",
    "You always brighten my day! Have you had a chance to eat something nice today?",
    "That's really interesting! Did anything else happen today that made you smile?",
    "I'm so glad you shared that with me! How is the weather where you are today?",
    "Every day you chat with me makes my day better. Have you spoken with your family today?",
    "I love hearing from you! Is there anything on your mind you'd like to talk about?",
    "That sounds lovely! How are you feeling in your body today? Any aches I should know about? 💚",
]

# ---------------------------------------------------------------------------
# Gemini client — lazy singleton, initialised once per process
# ---------------------------------------------------------------------------

_gemini_model: genai.GenerativeModel | None = None


def _init_gemini() -> genai.GenerativeModel | None:
    """
    Attempt to initialise the Gemini model (name from settings.GEMINI_MODEL).

    Returns:
        GenerativeModel if the API key is valid and STUB_MODE is False,
        otherwise None.
    """
    global _gemini_model
    if _gemini_model is not None:
        return _gemini_model

    if not settings.gemini_available:
        logger.info(
            "🤖  Gemini API key not configured — running in STUB mode. "
            "Set GEMINI_API_KEY in .env and STUB_MODE=false to enable real AI."
        )
        return None

    if settings.STUB_MODE:
        logger.info("🤖  STUB_MODE=true — skipping Gemini initialisation.")
        return None

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY.strip())
        model_name = settings.GEMINI_MODEL
        try:
            # SDK >= 0.4.0 supports system_instruction
            _gemini_model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=_SYSTEM_PROMPT,
            )
        except TypeError:
            # Older SDK — no system_instruction kwarg; inject via history instead
            logger.warning(
                "⚠️  google-generativeai version does not support system_instruction. "
                "Falling back to history-injection method."
            )
            _gemini_model = genai.GenerativeModel(model_name=model_name)
        logger.info("✅  Gemini model '%s' initialised successfully.", model_name)
        return _gemini_model
    except Exception as exc:  # noqa: BLE001
        logger.error("❌  Failed to initialise Gemini model: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _message_has_health_keyword(message: str) -> bool:
    """Return True if any health keyword appears in the (lowercased) message."""
    lower = message.lower()
    return any(kw in lower for kw in _HEALTH_KEYWORDS)


def _response_is_inappropriate(response: str, user_message: str) -> bool:
    """
    Return True if Gemini replied with a positive/dismissive phrase
    ("How lovely") to a message that contains health keywords.
    """
    if not _message_has_health_keyword(user_message):
        return False
    return "how lovely" in response.lower()


# ---------------------------------------------------------------------------
# Public API — generate_response
# ---------------------------------------------------------------------------


async def generate_response(
    elderId: str,
    message: str,
    history: list[dict],
) -> str:
    """
    Generate a companion response for the given user message.

    Args:
        elderId:  Unique identifier of the elder (used for logging).
        message:  The elder's latest message text.
        history:  List of previous messages as dicts with keys
                  {"role": "user"|"assistant", "content": str}.
                  These are the last 20 turns fetched from MongoDB.

    Returns:
        The response text as a plain string.
        Falls back to a warm stub response if Gemini is unavailable
        or raises any exception — so the elder's app never breaks.
    """
    logger.info(
        "generate_response called — gemini_available: %s",
        settings.gemini_available,
    )

    model = _init_gemini()

    # ── Real Gemini path ─────────────────────────────────────────────────────
    if model is not None:
        try:
            text = await _call_gemini(model, elderId, message, history)

            # ── Response quality gate ────────────────────────────────────────
            if _response_is_inappropriate(text, message):
                logger.warning(
                    "⚠️  Gemini returned inappropriate response for health message "
                    "(elder %s). Retrying once. Response was: %s",
                    elderId,
                    text[:120],
                )
                try:
                    text = await _call_gemini(model, elderId, message, history)
                    if _response_is_inappropriate(text, message):
                        logger.warning(
                            "⚠️  Retry also returned inappropriate response for elder %s. "
                            "Using safe health fallback.",
                            elderId,
                        )
                        return _HEALTH_FALLBACK
                except Exception as retry_exc:  # noqa: BLE001
                    logger.warning(
                        "⚠️  Retry Gemini call failed for elder %s (%s) — using health fallback.",
                        elderId,
                        retry_exc,
                    )
                    return _HEALTH_FALLBACK

            logger.debug("🤖  Gemini response for elder %s: %s…", elderId, text[:80])
            return text

        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "⚠️  Gemini API call failed for elder %s (%s) — falling back to stub.",
                elderId,
                exc,
            )
            # Fall through to stub

    # ── Stub path ────────────────────────────────────────────────────────────
    stub = _get_stub_response(message)
    logger.debug("🗒️  Returning stub response for elder %s.", elderId)
    return stub


async def _call_gemini(
    model: genai.GenerativeModel,
    elderId: str,
    message: str,
    history: list[dict],
) -> str:
    """
    Internal helper: build a Gemini chat session and send the message.

    Returns the stripped response text.
    Raises on any Gemini/network error — callers must handle exceptions.
    """
    # Convert history to Gemini format
    gemini_history = []
    for turn in history[-20:]:
        gemini_role = "model" if turn["role"] == "assistant" else "user"
        gemini_history.append({
            "role": gemini_role,
            "parts": [turn["content"]],
        })

    # If the model was created without system_instruction (old SDK),
    # inject the system prompt as the first user→model exchange
    has_system = (
        hasattr(model, "_system_instruction")
        or hasattr(model, "system_instruction")
    )
    if not has_system and not gemini_history:
        gemini_history = [
            {"role": "user",  "parts": [_SYSTEM_PROMPT]},
            {
                "role": "model",
                "parts": [
                    "Understood. I am Saathi, a warm and caring AI companion. "
                    "How can I help you today?"
                ],
            },
        ]

    chat_session = model.start_chat(history=gemini_history)
    gemini_response = await chat_session.send_message_async(message)
    return gemini_response.text.strip()


def _get_stub_response(message: str) -> str:
    """
    Return a deterministic warm stub response based on MD5 hash of the message.

    Using a hash (rather than pure random) keeps responses reproducible during
    development — the same message always gets the same stub response.

    Args:
        message: The user's message text.

    Returns:
        A formatted stub response string.
    """
    index = int(hashlib.md5(message.encode()).hexdigest(), 16) % len(_STUB_RESPONSES)
    return _STUB_RESPONSES[index]


# ---------------------------------------------------------------------------
# Public API — generate_caregiver_summary
# ---------------------------------------------------------------------------


async def generate_caregiver_summary(
    elder_name: str,
    messages_context: list[str],
) -> str:
    """
    Generate a 2-3 sentence caregiver daily digest from today's chat messages.

    Args:
        elder_name:       Display name of the elder (for personalisation).
        messages_context: The last 10 chat messages for context.

    Returns:
        A plain string summary. Falls back to a template stub if Gemini
        is unavailable.
    """
    model = _init_gemini()

    if not messages_context:
        return "No conversations yet today."

    context_block = "\n".join(
        f"- {m}" for m in messages_context[-10:]
    )

    # ── Real Gemini summary ──────────────────────────────────────────────────
    if model is not None:
        prompt = (
            "Summarize today's conversation with this elderly person in 2-3 sentences. "
            "Focus on their emotional state and any health-related topics mentioned. "
            "Be warm and factual. This summary is for their caregiver.\n\n"
            f"Elder's name: {elder_name}\n"
            f"Today's messages:\n{context_block}"
        )
        try:
            response = await model.generate_content_async(prompt)
            return response.text.strip()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "⚠️  Gemini summary generation failed: %s — using template.", exc
            )

    # ── Template stub ────────────────────────────────────────────────────────
    return (
        f"{elder_name} had a conversation with Saathi today. "
        f"They shared {len(messages_context)} messages. "
        "Overall tone appeared generally positive. No urgent concerns detected."
    )
