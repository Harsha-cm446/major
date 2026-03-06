"""
AI Interview Platform — Optimized Main Application
────────────────────────────────────────────────────
  • AI models warm-loaded at startup for < 3s interview start
  • Groq API (llama-3.3-70b-versatile) for LLM inference
  • CORS allows all origins for public access
  • Bind to 0.0.0.0 for network-wide access
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection
from app.routers import auth, interviews, mock_interview, websocket, candidate_interview, practice_mode, analytics, data_collection, stt_websocket
from app.services.ai_service import ai_service


# ── Lifespan (startup + shutdown) ─────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    await connect_to_mongo()
    # Warm up AI models so first interview starts in < 3 seconds
    try:
        await ai_service.warm_up()
    except Exception as e:
        print(f"⚠️ AI warm-up failed (non-fatal): {e}")

    # Pre-download and cache the Vosk STT model at startup
    # so it's ready instantly when the first interview starts
    try:
        import sys, os
        _ai_engine_dir = os.path.join(os.path.dirname(__file__), "ai-engine")
        if os.path.isdir(_ai_engine_dir):
            sys.path.insert(0, os.path.abspath(_ai_engine_dir))
        from speech_to_text import get_vosk_model, VOSK_AVAILABLE
        if VOSK_AVAILABLE:
            print("⏳ Pre-loading Vosk STT model (this may take a moment on first run)...")
            model = get_vosk_model()
            if model:
                print("✅ Vosk STT model ready")
            else:
                print("⚠️ Vosk STT model failed to load (STT will use fallback)")
        else:
            print("ℹ️ Vosk not installed — STT will use Web Speech API fallback")
    except Exception as e:
        print(f"⚠️ Vosk pre-load failed (non-fatal): {e}")

    print("🚀 AI Interview Platform ready")
    yield
    # SHUTDOWN
    try:
        await ai_service.shutdown()
    except Exception:
        pass
    await close_mongo_connection()


app = FastAPI(
    title="AI Interview Platform",
    description="AI-Based Realistic HR Interview Simulator & Recruitment Platform",
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS — allow frontend origin + local dev ─────────
origins = ["*"]
if settings.FRONTEND_URL:
    origins = [
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
    ]
    # Also allow any Render subdomain
    if ".onrender.com" not in (settings.FRONTEND_URL or ""):
        origins.append("https://*.onrender.com")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────
app.include_router(auth.router)
app.include_router(interviews.router)
app.include_router(mock_interview.router)
app.include_router(candidate_interview.router)
app.include_router(websocket.router)
app.include_router(practice_mode.router)
app.include_router(analytics.router)
app.include_router(data_collection.router)
app.include_router(stt_websocket.router)


# ── Health check ──────────────────────────────────────

@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "AI Interview Platform API",
        "ai_ready": ai_service._warmed_up,
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "ai_warmed": ai_service._warmed_up,
        "llm_model": settings.GROQ_MODEL,
    }


@app.get("/api/diagnostics/groq")
async def groq_diagnostics():
    """Show Groq API call statistics for this server instance."""
    from app.services.model_registry import model_registry
    return model_registry.get_stats()


# ── Run directly: python main.py ─────────────────────
if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )
