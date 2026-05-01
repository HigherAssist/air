"""
Cross-check DB record counts against the Loxo API to verify data integrity.

Usage:
    python scripts/verify_counts.py
"""
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.orm_models import Candidate, Job, Match
from data_sync.loxo.client import LoxoClient
from data_sync.loxo.sync_candidates import STATUS_NAMES, EXCLUDED_STATUS_IDS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s — %(message)s")
logger = logging.getLogger(__name__)


def main():
    settings = get_settings()
    engine = create_engine(settings.DATABASE_URL_SYNC)

    print("\n" + "=" * 60)
    print("AIR Sourcing — Data Verification Report")
    print("=" * 60)

    with Session(engine) as db, LoxoClient() as client:

        # --- Jobs ---
        db_job_count = db.execute(select(func.count()).select_from(Job)).scalar()
        loxo_jobs = client.get_all_active_jobs(status_id=settings.LOXO_ACTIVE_JOB_STATUS_ID)
        loxo_job_count = len(loxo_jobs)
        status = "OK" if db_job_count == loxo_job_count else "MISMATCH"
        print(f"\nJobs:     DB={db_job_count}  Loxo={loxo_job_count}  [{status}]")

        # Jobs missing embeddings
        no_embed = db.execute(
            select(func.count()).where(Job.embedding.is_(None))
        ).scalar()
        print(f"  Jobs without embeddings: {no_embed}")

        # --- Candidates ---
        # All 10 Loxo person global statuses — includes ones we intentionally skip
        ALL_STATUSES = {
            30198: ("uncontacted",    True),   # (name, synced)
            30199: ("contacted",      True),
            30200: ("applied",        True),
            30201: ("replied",        True),
            30202: ("in_progress",    True),
            30203: ("nurture",        True),
            30204: ("unresponsive",   True),
            30205: ("do_not_contact", False),  # intentionally excluded
            30206: ("bad_data",       False),  # intentionally excluded
            30207: ("hired",          True),
        }

        print("\nCandidates by status:")
        print(f"  {'Status':<16} {'Synced':>6}  {'DB':>8}  {'Loxo API':>10}  {'Check':>8}")
        print(f"  {'-'*16} {'-'*6}  {'-'*8}  {'-'*10}  {'-'*8}")

        total_db = 0
        total_loxo = 0
        for status_id, (status_name, synced) in ALL_STATUSES.items():
            db_count = db.execute(
                select(func.count()).where(Candidate.global_status == status_name)
            ).scalar()
            try:
                data = client._get("/people", params={"person_global_status_id": status_id})
                loxo_count = data.get("total_count", "?")
            except Exception:
                loxo_count = "ERR"

            if not synced:
                check = "SKIP"
            else:
                check = "OK" if str(db_count) == str(loxo_count) else "≠"
            sync_label = "yes" if synced else "no"
            print(f"  {status_name:<16} {sync_label:>6}  {db_count:>8}  {str(loxo_count):>10}  {check:>8}")
            total_db += db_count
            if isinstance(loxo_count, int):
                total_loxo += loxo_count

        print(f"  {'TOTAL':<16} {total_db:>8}  {total_loxo:>10}")

        # Total Loxo people vs DB (catches null-status gap)
        try:
            loxo_total_data = client._get("/people", params={"per_page": 1})
            loxo_total = loxo_total_data.get("total_count", "?")
        except Exception:
            loxo_total = "ERR"
        excluded = sum(
            db.execute(select(func.count()).where(Candidate.global_status_id == sid)).scalar()
            for sid in EXCLUDED_STATUS_IDS
        )
        synced_total = db.execute(select(func.count()).select_from(Candidate)).scalar()
        loxo_syncable = (loxo_total - total_loxo + total_db) if isinstance(loxo_total, int) else "?"
        null_status_loxo = (loxo_total - total_loxo) if isinstance(loxo_total, int) else "?"
        print(f"\n  Loxo total people (all statuses): {loxo_total}")
        print(f"  Loxo with known status:           {total_loxo}  (incl. {excluded} excluded)")
        print(f"  Loxo with no status set:          {null_status_loxo}")
        print(f"  DB total:                         {synced_total}")
        gap = (loxo_total - excluded - synced_total) if isinstance(loxo_total, int) else "?"
        status = "OK" if gap == 0 else f"GAP of {gap}"
        print(f"  Coverage check (Loxo - excluded - DB): [{status}]")

        # Candidates missing embeddings
        no_embed_c = db.execute(
            select(func.count()).where(Candidate.embedding.is_(None))
        ).scalar()
        print(f"\n  Candidates without embeddings: {no_embed_c}")

        # Candidates with resume text
        with_resume = db.execute(
            select(func.count()).where(Candidate.resume_text.isnot(None), Candidate.resume_text != "")
        ).scalar()
        print(f"  Candidates with resume text: {with_resume}")

        # --- Matches ---
        match_count = db.execute(select(func.count()).select_from(Match)).scalar()
        jobs_with_matches = db.execute(
            select(func.count(Match.job_id.distinct()))
        ).scalar()
        avg_score_result = db.execute(select(func.avg(Match.score))).scalar()
        avg_score = round(avg_score_result, 1) if avg_score_result else 0
        print(f"\nMatches:  {match_count} total across {jobs_with_matches} jobs (avg score: {avg_score})")

    print("\n" + "=" * 60)
    engine.dispose()


if __name__ == "__main__":
    main()
