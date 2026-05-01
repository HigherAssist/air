"""
Check a job's match data and overall candidate freshness.
Usage: python scripts/check_job_matches.py <job_id>
"""
import sys
sys.path.insert(0, "/app")

from sqlalchemy import create_engine, text
from app.config import get_settings

job_id = int(sys.argv[1]) if len(sys.argv) > 1 else 3568685

s = get_settings()
engine = create_engine(s.DATABASE_URL_SYNC)

with engine.connect() as db:
    job = db.execute(text("SELECT id, title, last_synced_at FROM jobs WHERE id=:jid"), {"jid": job_id}).fetchone()
    if not job:
        print(f"JOB {job_id} NOT FOUND in DB")
    else:
        print(f"Job: {job.id} | {job.title}")
        print(f"  Last synced: {job.last_synced_at}")

        total_matches = db.execute(text("SELECT COUNT(*) FROM matches WHERE job_id=:jid"), {"jid": job_id}).scalar()
        print(f"  Total matches in DB: {total_matches}")

        rows = db.execute(text("""
            SELECT c.first_name, c.last_name, c.current_title, c.global_status, m.score, c.last_synced_at
            FROM matches m JOIN candidates c ON c.id = m.candidate_id
            WHERE m.job_id = :jid
            ORDER BY m.score DESC LIMIT 15
        """), {"jid": job_id}).fetchall()
        print(f"\n  Top {len(rows)} matches:")
        for r in rows:
            print(f"    score={r.score:>3} | {r.first_name} {r.last_name} | {r.current_title} | status={r.global_status} | synced={str(r.last_synced_at)[:19]}")

    print()
    freshness = db.execute(text(
        "SELECT MIN(last_synced_at) as oldest, MAX(last_synced_at) as newest, COUNT(*) as total FROM candidates"
    )).fetchone()
    print(f"Candidate DB total: {freshness.total}")
    print(f"  Oldest sync: {freshness.oldest}")
    print(f"  Newest sync: {freshness.newest}")

    by_status = db.execute(text(
        "SELECT global_status, COUNT(*) as cnt FROM candidates GROUP BY global_status ORDER BY cnt DESC"
    )).fetchall()
    print("\nCandidates by status:")
    for r in by_status:
        print(f"  {r.global_status:<16} {r.cnt}")
