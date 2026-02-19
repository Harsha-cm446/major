"""
Shared model registry — provides singleton instances of heavy ML models
to prevent duplicate loading across services.

Includes Gemini model fallback chain — when the primary model hits quota /
rate-limit errors (429, 503, RESOURCE_EXHAUSTED), automatically retries
with the next free-tier Gemini model.

Usage:
    from app.services.model_registry import model_registry
    embedding = model_registry.embedding_model.encode("hello")
    client = model_registry.gemini_client
    text = await model_registry.gemini_generate(prompt, system, fast=True)
"""

import time
import asyncio
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Lazy-loading singleton registry for shared ML models.

    Includes Gemini model fallback chain — when the primary model hits
    quota / rate-limit errors (429, 503, RESOURCE_EXHAUSTED), the registry
    automatically retries with the next model in the fallback list.
    """

    # Error substrings that indicate quota / rate-limit exhaustion
    _QUOTA_ERROR_MARKERS = (
        "429", "resource_exhausted", "rate limit", "quota",
        "too many requests", "503", "overloaded", "capacity",
    )

    def __init__(self):
        self._embedding_model = None
        self._gemini_client = None

        # Build ordered model list: primary first, then fallbacks
        self._model_chain = [settings.GEMINI_MODEL]
        if settings.GEMINI_FALLBACK_MODELS:
            for m in settings.GEMINI_FALLBACK_MODELS.split(","):
                m = m.strip()
                if m and m not in self._model_chain:
                    self._model_chain.append(m)

        # Track which model is currently active + cooldown per model
        self._active_model_idx = 0
        self._model_cooldowns: dict = {}  # model -> timestamp when cooldown expires
        self._cooldown_seconds = 60  # skip a model for 60s after a quota error

    # ── SentenceTransformer (single instance, ~90 MB) ────────────
    @property
    def embedding_model(self):
        if self._embedding_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
                logger.info("ModelRegistry: SentenceTransformer loaded (shared)")
            except Exception as e:
                logger.warning(f"ModelRegistry: SentenceTransformer unavailable: {e}")
        return self._embedding_model

    # ── Google Gemini client (single instance) ───────────────────
    @property
    def gemini_client(self):
        if self._gemini_client is None:
            try:
                from google import genai
                self._gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
                logger.info("ModelRegistry: Gemini client created (shared)")
            except Exception as e:
                logger.warning(f"ModelRegistry: Gemini client unavailable: {e}")
        return self._gemini_client

    @property
    def active_model(self) -> str:
        """Return the currently active model name."""
        return self._model_chain[self._active_model_idx]

    def _is_quota_error(self, error: Exception) -> bool:
        """Check if an exception indicates a quota / rate-limit problem."""
        err_str = str(error).lower()
        return any(marker in err_str for marker in self._QUOTA_ERROR_MARKERS)

    def _next_available_model(self, skip_model: str) -> Optional[str]:
        """Find the next model that is not on cooldown."""
        now = time.time()
        # Mark current model as on cooldown
        self._model_cooldowns[skip_model] = now + self._cooldown_seconds

        for i, model in enumerate(self._model_chain):
            if model == skip_model:
                continue
            cooldown_until = self._model_cooldowns.get(model, 0)
            if now >= cooldown_until:
                self._active_model_idx = i
                logger.warning(f"ModelRegistry: Switching to fallback model: {model}")
                return model

        # All models on cooldown — use the one that expires soonest
        soonest_model = min(self._model_chain, key=lambda m: self._model_cooldowns.get(m, 0))
        self._active_model_idx = self._model_chain.index(soonest_model)
        logger.warning(f"ModelRegistry: All models on cooldown, using {soonest_model}")
        return soonest_model

    async def gemini_generate(
        self,
        prompt: str,
        system: str = "",
        fast: bool = False,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Call Gemini API with automatic model fallback on quota errors.

        Tries the active model first, then rotates through the fallback
        chain.  Each model gets at most one attempt per call.
        """
        from google.genai import types as genai_types

        client = self.gemini_client
        if not client:
            logger.error("Gemini error: GEMINI_API_KEY not configured")
            return ""

        if max_tokens is None:
            max_tokens = 512 if fast else 2048

        # Build list of models to try (active first, then others)
        now = time.time()
        tried = set()
        models_to_try = []
        # Start with active model if not on cooldown
        active = self._model_chain[self._active_model_idx]
        if now >= self._model_cooldowns.get(active, 0):
            models_to_try.append(active)
            tried.add(active)
        # Add remaining models not on cooldown
        for m in self._model_chain:
            if m not in tried and now >= self._model_cooldowns.get(m, 0):
                models_to_try.append(m)
                tried.add(m)
        # Add cooldown models as last resort
        for m in self._model_chain:
            if m not in tried:
                models_to_try.append(m)
                tried.add(m)

        last_error = None
        for model_name in models_to_try:
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model_name,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=system if system else None,
                        temperature=0.7,
                        max_output_tokens=max_tokens,
                    ),
                )
                text = response.text if response.text else ""
                if text:
                    # Success — update active model index
                    idx = self._model_chain.index(model_name)
                    if idx != self._active_model_idx:
                        self._active_model_idx = idx
                        logger.info(f"ModelRegistry: Now using model {model_name}")
                return text
            except Exception as e:
                last_error = e
                if self._is_quota_error(e):
                    logger.warning(f"ModelRegistry: Quota/rate-limit on {model_name}: {e}")
                    self._model_cooldowns[model_name] = time.time() + self._cooldown_seconds
                    continue  # try next model
                else:
                    # Non-quota error — don't retry with other models
                    logger.error(f"Gemini error ({model_name}): {e}")
                    return ""

        # All models exhausted
        logger.error(f"Gemini error: All models exhausted. Last error: {last_error}")
        return ""

    def warm_up(self):
        """Eagerly load all models (call during app startup)."""
        _ = self.embedding_model
        _ = self.gemini_client
        logger.info(f"ModelRegistry: Model chain = {self._model_chain}")


model_registry = ModelRegistry()
