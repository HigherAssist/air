"""
Pre-compute match scores for all active jobs × top candidates.

Strategy:
  1. For each active job, use pgvector to find the top-N most similar candidates
  2. For each of those candidates, call Groq LLM to get a score + reasoning
  3. Store results in the matches table for fast recall by the chatbot

Rate limit handling (Groq free tier: 30 req/min):
  - MATCH_LLM_SLEEP=2.0s between calls → ~30/min max, stays under limit
  - For 28 jobs × 20 LLM calls = 560 total calls → ~19 minutes to complete

Usage:
    python scripts/run_matching.py [--job-id 12345] [--force]
    --job-id: Only compute for one specific job
    --force:  Recompute even if a match score already exists
"""
import argparse
import asyncio
import logging
import os
import ssl
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

from app.config import get_settings
from app.db.orm_models import Job, Match
from app.services.matcher import vector_search_candidates, score_pair

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def run(job_id_filter: int = None, force: bool = False):
    settings = get_settings()
    db_url = settings.DATABASE_URL.split("?")[0]  # asyncpg doesn't support sslmode URL param
    # RDS uses a self-signed cert chain — disable verification (encryption still active)
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(db_url, pool_pre_ping=True, connect_args={"ssl": ssl_ctx})
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    start = datetime.utcnow()
    logger.info("=" * 60)
    logger.info("Pre-computing match scores")
    logger.info("Top-K vector: %d | Top-K LLM: %d | Min score: %d",
                settings.MATCH_TOP_K_VECTOR, settings.MATCH_TOP_K_LLM, settings.MATCH_MIN_SCORE)
    logger.info("Sleep between Groq calls: %.1fs", settings.MATCH_LLM_SLEEP)
    logger.info("=" * 60)

    async with factory() as db:
        # Load jobs to process
        query = select(Job)
        if job_id_filter:
            query = query.where(Job.id == job_id_filter)
        result = await db.execute(query)
        jobs = result.scalars().all()

    logger.info("Jobs to process: %d", len(jobs))
    total_scored = 0
    total_skipped = 0

    for i, job in enumerate(jobs):
        logger.info("\n[%d/%d] Job %d: %s", i + 1, len(jobs), job.id, job.title)

        async with factory() as db:
            # Phase 1: Vector similarity pre-filter
            top_candidates = await vector_search_candidates(
                job, db, limit=settings.MATCH_TOP_K_VECTOR
            )
            llm_candidates = top_candidates[:settings.MATCH_TOP_K_LLM]

            logger.info("  Vector search found %d candidates (scoring top %d with LLM)...",
                        len(top_candidates), len(llm_candidates))

            job_scored = 0
            for candidate, similarity in llm_candidates:
                # Skip if already scored and not forcing
                if not force:
                    existing = await db.execute(
                        select(Match).where(
                            Match.job_id == job.id,
                            Match.candidate_id == candidate.id,
                        )
                    )
                    if existing.scalar_one_or_none():
                        total_skipped += 1
                        continue

                try:
                    match = await score_pair(job, candidate, db, vector_similarity=similarity, store=True)
                    full_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip()
                    logger.info("    %s (ID=%d) → score=%d", full_name, candidate.id, match.score)
                    job_scored += 1
                    total_scored += 1
                    await asyncio.sleep(settings.MATCH_LLM_SLEEP)
                except Exception as e:
                    logger.error("    Error scoring candidate %d: %s", candidate.id, e)
                    continue

            logger.info("  Job %d complete: %d new scores computed.", job.id, job_scored)

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info("\n%s", "=" * 60)
    logger.info("Matching complete: %d scores computed, %d skipped (%.1fs / %.1f min)",
                total_scored, total_skipped, elapsed, elapsed / 60)
    await engine.dispose()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", type=int, default=None)
    parser.add_argument("--force", action="store_true", help="Recompute existing scores")
    args = parser.parse_args()
    asyncio.run(run(job_id_filter=args.job_id, force=args.force))


if __name__ == "__main__":
    main()
