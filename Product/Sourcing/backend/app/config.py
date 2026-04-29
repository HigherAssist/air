"""
Application configuration loaded from environment variables / .env file.
All tuneable parameters are defined here. See .env.example for documentation.
"""
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    DATABASE_URL: str = "postgresql+asyncpg://sourcing:changeme@localhost:5432/sourcing"
    DATABASE_URL_SYNC: str = "postgresql+psycopg2://sourcing:changeme@localhost:5432/sourcing"

    # ------------------------------------------------------------------ #
    # Groq LLM
    # ------------------------------------------------------------------ #
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_TEMPERATURE: float = 0.1        # Conservative: grounded, factual answers
    GROQ_MAX_TOKENS: int = 2048
    GROQ_TIMEOUT_SECONDS: int = 45       # Configurable response timeout

    # ------------------------------------------------------------------ #
    # Loxo ATS API
    # ------------------------------------------------------------------ #
    LOXO_BASE_URL: str = "https://app.loxo.co/api"
    LOXO_AGENCY_SLUG: str = "artizen-staffing"
    LOXO_USERNAME: str = ""
    LOXO_PASSWORD: str = ""
    LOXO_REQUEST_SLEEP: float = 0.25     # Seconds between bulk API requests
    LOXO_MAX_RETRIES: int = 3

    # ------------------------------------------------------------------ #
    # AWS / S3
    # ------------------------------------------------------------------ #
    S3_BUCKET: str = "artizen-sourcing-resumes-dev"
    AWS_REGION: str = "us-east-2"

    # ------------------------------------------------------------------ #
    # Embedding model (runs locally in the backend container)
    # ------------------------------------------------------------------ #
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384

    # ------------------------------------------------------------------ #
    # Data Sync
    # ------------------------------------------------------------------ #
    SYNC_INTERVAL_HOURS: int = 24
    # Loxo person_global_status_id values to include (Option B)
    CANDIDATE_STATUS_IDS: str = "30198,30199,30200,30201,30202,30203,30204,30207"
    LOXO_ACTIVE_JOB_STATUS_ID: int = 6875

    # ------------------------------------------------------------------ #
    # Matching service
    # ------------------------------------------------------------------ #
    MATCH_TOP_K_VECTOR: int = 30          # Vector pre-filter candidates per job
    MATCH_TOP_K_LLM: int = 20            # LLM-scored candidates per job
    MATCH_MIN_SCORE: int = 30            # Minimum score to store/return
    MATCH_LLM_SLEEP: float = 2.0         # Sleep between Groq calls in batch

    # ------------------------------------------------------------------ #
    # Chat / session management
    # ------------------------------------------------------------------ #
    MAX_CHAT_SESSIONS: int = 5
    MAX_HISTORY_MESSAGES: int = 8        # Last 4 exchanges — keeps context tight
    CHAT_TIMEOUT_SECONDS: int = 90
    CHAT_TOKEN_ALERT_THRESHOLD: int = 6000  # Warn if input tokens exceed this

    # ------------------------------------------------------------------ #
    # Security
    # ------------------------------------------------------------------ #
    API_TOKEN_SECRET: str = "change-this-to-a-long-random-secret"

    # ------------------------------------------------------------------ #
    # CORS (space-separated list of allowed origins)
    # ------------------------------------------------------------------ #
    ALLOWED_ORIGINS: str = "http://localhost:3000 http://localhost:5173"

    # ------------------------------------------------------------------ #
    # Logging
    # ------------------------------------------------------------------ #
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/sourcing.log"

    model_config = {"env_file": ".env", "case_sensitive": True}

    @property
    def candidate_status_id_list(self) -> List[int]:
        return [int(x.strip()) for x in self.CANDIDATE_STATUS_IDS.split(",")]

    @property
    def allowed_origins_list(self) -> List[str]:
        return self.ALLOWED_ORIGINS.split()


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def configure_logging(settings: Settings) -> None:
    log_path = Path(settings.LOG_FILE)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(log_path),
        ],
    )
