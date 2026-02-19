"""
AI Interview Platform — Optimized Main Application
────────────────────────────────────────────────────
  • AI models warm-loaded at startup for < 3s interview start
  • Google Gemini API (gemini-2.5-flash) for LLM inference
  • CORS allows all origins for public access
  • Bind to 0.0.0.0 for network-wide access
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection
from app.routers import auth, interviews, mock_interview, websocket, candidate_interview, practice_mode, analytics, data_collection
from app.services.ai_service import ai_service


# ── Lifespan (startup + shutdown) ─────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    await connect_to_mongo()
    # Warm up AI models so first interview starts in < 3 seconds
    await ai_service.warm_up()
    print("🚀 AI Interview Platform ready")
    yield
    # SHUTDOWN
    await ai_service.shutdown()
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
        "gemini_model": settings.GEMINI_MODEL,
    }


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
