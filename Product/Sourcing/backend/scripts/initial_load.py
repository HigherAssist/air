"""
One-time initial data load from Loxo into the local database.

Loads:
  - All 28 active jobs (full detail + embeddings)
  - All candidates with Option B statuses (~1,287 people)
    (Contacted, Applied, Replied, In Progress, Nurture, Unresponsive, Hired)
  - Resumes for candidates who have them

This script is designed to be run once to populate the database from scratch.
For subsequent updates, use the daily sync (data-sync/sync_main.py).

Usage:
    cd Product/Sourcing
    python scripts/initial_load.py [--skip-resumes] [--jobs-only] [--candidates-only]

Time estimate for Option B:
  - Jobs: ~1-2 min (28 jobs × full detail fetch)
  - Candidates: ~30-60 min (1,287 people × full profile + potential resume download)
  - Resume download depends on how many have attached resumes
"""
import argparse
import logging
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services.embeddings import embed_job, embed_candidate
from data_sync.loxo.client import LoxoClient
from data_sync.loxo.sync_jobs import sync_all_jobs
from data_sync.loxo.sync_candidates import sync_candidates_by_status

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


class EmbedderAdapter:
    def embed_job(self, job) -> list:
        return embed_job(job)
    def embed_candidate(self, candidate) -> list:
        return embed_candidate(candidate)


def main():
    parser = argparse.ArgumentParser(description="Initial Loxo data load")
    parser.add_argument("--skip-resumes", action="store_true", help="Skip resume downloads (faster)")
    parser.add_argument("--jobs-only", action="store_true")
    parser.add_argument("--candidates-only", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    os.makedirs("logs", exist_ok=True)

    start = datetime.utcnow()
    logger.info("=" * 60)
    logger.info("AIR Sourcing — Initial Data Load")
    logger.info("Started: %s UTC", start.isoformat())
    logger.info("=" * 60)

    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    embedder = EmbedderAdapter()

    with LoxoClient() as client, Session(engine) as db:

        if not args.candidates_only:
            logger.info("\n--- Syncing active jobs ---")
            t0 = time.time()
            job_count = sync_all_jobs(client, db, embedder)
            logger.info("Jobs done: %d (%.1fs)", job_count, time.time() - t0)

        if not args.jobs_only:
            logger.info("\n--- Syncing candidates (Option B statuses) ---")
            logger.info("Statuses: Contacted, Applied, Replied, In Progress, Nurture, Unresponsive, Hired")
            if args.skip_resumes:
                logger.info("(Resume downloads skipped)")
            t0 = time.time()
            candidate_count = sync_candidates_by_status(
                loxo_client=client,
                db=db,
                embedder=embedder,
                status_ids=settings.candidate_status_id_list,
                fetch_full_profile=True,
                download_resumes=not args.skip_resumes,
                s3_bucket=settings.S3_BUCKET,
            )
            logger.info("Candidates done: %d (%.1fs)", candidate_count, time.time() - t0)

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info("\n%s", "=" * 60)
    logger.info("Initial load complete in %.1fs (%.1f min)", elapsed, elapsed / 60)
    logger.info("Next step: run scripts/run_matching.py to pre-compute match scores")
    engine.dispose()


if __name__ == "__main__":
    main()
