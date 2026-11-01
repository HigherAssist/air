"""
AIR Candidate Sourcing Chatbot — FastAPI Backend
Entry point: uvicorn app.main:app
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import candidates, chat, jobs, matches, status
from app.config import configure_logging, get_settings
from app.db.session import get_engine
from app.db.orm_models import Base

settings = get_settings()
configure_logging(settings)
logger = logging.getLogger(__name__)


app = FastAPI(
    title="AIR Sourcing API",
    description="Candidate sourcing chatbot backend for HireAssist AIR",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow the AIR frontend and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers — all under /api to match ALB path-routing rule
app.include_router(jobs.router, prefix="/api")
app.include_router(candidates.router, prefix="/api")
app.include_router(matches.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(status.router, prefix="/api")


@app.on_event("startup")
async def startup():
    logger.info("AIR Sourcing API starting up...")
    # Warm up the embedding model so the first request is fast
    from app.services.embeddings import embed_text
    _ = embed_text("warmup")
    logger.info("Embedding model ready.")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/health")
async def api_health():
    """ALB-routed health endpoint for external callers and tests."""
    return {"status": "ok"}
