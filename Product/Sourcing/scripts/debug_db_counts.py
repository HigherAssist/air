"""
Debug script: check row counts and sample data in all tables.
Run via ECS: cd /app && PYTHONPATH=/app python scripts/debug_db_counts.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text
from app.config import get_settings

s = get_settings()
engine = create_engine(s.DATABASE_URL_SYNC, pool_pre_ping=True)

with engine.connect() as conn:
    tables = ["jobs", "candidates", "matches", "chat_sessions", "chat_messages"]
    print("=== Table Row Counts ===")
    for t in tables:
        count = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
        print(f"  {t}: {count}")

    print("\n=== Sample Jobs (up to 10) ===")
    rows = conn.execute(text(
        "SELECT id, title, company_name, location, global_status FROM jobs LIMIT 10"
    )).fetchall()
    if rows:
        for r in rows:
            print(f"  [{r.id}] {r.title} @ {r.company_name} ({r.location}) status={r.global_status}")
    else:
        print("  (no jobs)")

    print("\n=== Candidate Status Distribution ===")
    rows = conn.execute(text(
        "SELECT global_status, COUNT(*) as cnt FROM candidates GROUP BY global_status ORDER BY cnt DESC"
    )).fetchall()
    for r in rows:
        print(f"  {r.global_status}: {r.cnt}")

    print("\n=== Top 5 Match Scores ===")
    rows = conn.execute(text(
        "SELECT job_id, candidate_id, score FROM matches ORDER BY score DESC LIMIT 5"
    )).fetchall()
    if rows:
        for r in rows:
            print(f"  job={r.job_id} candidate={r.candidate_id} score={r.score}")
    else:
        print("  (no matches computed yet)")

engine.dispose()
print("\nDone.")
