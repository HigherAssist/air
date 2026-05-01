"""
Entry point for the daily Loxo data sync ECS task.
Run by EventBridge on a schedule (default: daily at 2am UTC).

Usage:
    python sync_main.py [--jobs-only | --candidates-only]
"""
import argparse
import logging
import os
import sys
from datetime import datetime

# Ensure project modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from data_sync.loxo.client import LoxoClient
from data_sync.loxo.sync_jobs import sync_all_jobs
from data_sync.loxo.sync_candidates import sync_all_candidates

# Import embedder from backend (shared module)
from app.services.embeddings import embed_job, embed_candidate
from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/sync.log"),
    ],
)
logger = logging.getLogger(__name__)


class EmbedderAdapter:
    """Adapter so sync modules can call embed_job / embed_candidate."""
    def embed_job(self, job) -> list:
        return embed_job(job)

    def embed_candidate(self, candidate) -> list:
        return embed_candidate(candidate)


def main():
    parser = argparse.ArgumentParser(description="Loxo → DB sync")
    parser.add_argument("--jobs-only", action="store_true")
    parser.add_argument("--candidates-only", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    os.makedirs("logs", exist_ok=True)

    start = datetime.utcnow()
    logger.info("=== Sourcing sync started at %s UTC ===", start.isoformat())

    # Sync URL uses the synchronous psycopg2 driver (scripts run synchronously)
    db_url = settings.DATABASE_URL_SYNC
    engine = create_engine(db_url, pool_pre_ping=True)

    embedder = EmbedderAdapter()

    with LoxoClient() as client, Session(engine) as db:
        if not args.candidates_only:
            job_count = sync_all_jobs(client, db, embedder, status_id=settings.LOXO_ACTIVE_JOB_STATUS_ID)
            logger.info("Jobs synced: %d", job_count)

        if not args.jobs_only:
            candidate_count = sync_all_candidates(
                loxo_client=client,
                db=db,
                embedder=embedder,
                fetch_full_profile=True,
                download_resumes=True,
                s3_bucket=settings.S3_BUCKET,
            )
            logger.info("Candidates synced: %d", candidate_count)

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info("=== Sync complete in %.1fs ===", elapsed)


if __name__ == "__main__":
    main()
