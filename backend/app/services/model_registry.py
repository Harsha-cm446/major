"""
Shared model registry — provides singleton instances of heavy ML models
to prevent duplicate loading across services.

Usage:
    from app.services.model_registry import model_registry
    embedding = model_registry.embedding_model.encode("hello")
    client = model_registry.gemini_client
"""

import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Lazy-loading singleton registry for shared ML models."""

    def __init__(self):
        self._embedding_model = None
        self._gemini_client = None

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

    def warm_up(self):
        """Eagerly load all models (call during app startup)."""
        _ = self.embedding_model
        _ = self.gemini_client


model_registry = ModelRegistry()
