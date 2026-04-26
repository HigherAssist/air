"""
Data integrity check for the AIR Sourcing system.

Checks:
  1. Loxo API — live job and candidate data (using the real Loxo client)
  2. Database — table counts, name coverage, embedding coverage, job/candidate quality
  3. Match scores — coverage across jobs, score distribution, top matches with names

Run locally (from the backend/ directory):
  cd Product/Sourcing/backend
  PYTHONPATH=. python scripts/check_data.py

Run via ECS one-off task:
  ["sh","-c","cd /app && PYTHONPATH=/app python scripts/check_data.py"]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text
from app.config import get_settings

settings = get_settings()

PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"
INFO = "[INFO]"


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


# -----------------------------------------------------------------------
# Section 1: Loxo API — verify live data is accessible
# -----------------------------------------------------------------------
section("1. Loxo API — Live Data")

from data_sync.loxo.client import LoxoClient

loxo = LoxoClient(
    base_url=settings.LOXO_BASE_URL,
    agency_slug=settings.LOXO_AGENCY_SLUG,
    username=settings.LOXO_USERNAME,
    password=settings.LOXO_PASSWORD,
)

# 1a. Active jobs
print("\nActive jobs (status_id=6875):")
try:
    loxo_jobs = loxo.get_all_active_jobs(status_id=settings.LOXO_ACTIVE_JOB_STATUS_ID)
    total_loxo_jobs = len(loxo_jobs)
    if total_loxo_jobs > 0:
        print(f"  {PASS} Fetched {total_loxo_jobs} active jobs from Loxo")
        for j in loxo_jobs[:5]:
            company = j.get("company") or {}
            print(f"  {INFO}   [{j['id']}] {j.get('title','')} @ {company.get('name','') if isinstance(company,dict) else company}")
        if total_loxo_jobs > 5:
            print(f"  {INFO}   ... and {total_loxo_jobs-5} more")
    else:
        print(f"  {WARN} No active jobs returned — check LOXO_ACTIVE_JOB_STATUS_ID={settings.LOXO_ACTIVE_JOB_STATUS_ID}")
except Exception as e:
    loxo_jobs = []
    total_loxo_jobs = 0
    print(f"  {FAIL} get_all_active_jobs failed: {e}")

# 1b. Full job detail
if loxo_jobs:
    sample_job_id = loxo_jobs[0]["id"]
    try:
        jd = loxo.get_job(sample_job_id)
        desc_len = len(jd.get("description") or "")
        title = jd.get("title") or jd.get("name") or ""
        print(f"  {PASS} get_job({sample_job_id}) works — '{title}' has {desc_len} chars in description")
    except Exception as e:
        print(f"  {FAIL} get_job({sample_job_id}) failed: {e}")

# 1c. Candidates — sample one status
print("\nCandidates from Loxo (status=in_progress / 30202, first 5):")
try:
    sample_cands = []
    for c in loxo.iter_people_by_status(30202):
        sample_cands.append(c)
        if len(sample_cands) >= 5:
            break
    if sample_cands:
        print(f"  {PASS} iter_people_by_status(30202) works, returned candidates include:")
        for c in sample_cands[:3]:
            print(f"  {INFO}   [{c['id']}] {c.get('name','')} — {c.get('current_title','')}")
    else:
        print(f"  {WARN} No candidates returned for status 30202")
except Exception as e:
    sample_cands = []
    print(f"  {FAIL} iter_people_by_status failed: {e}")

# 1d. Full person detail
if sample_cands:
    pid = sample_cands[0]["id"]
    try:
        pd = loxo.get_person(pid)
        name_field = pd.get("name") or ""
        has_job_profiles = bool(pd.get("job_profiles"))
        has_education = bool(pd.get("education_profiles"))
        has_emails = bool(pd.get("emails"))
        print(f"  {PASS} get_person({pid}) works:")
        print(f"  {INFO}   name='{name_field}' | job_profiles={has_job_profiles} | education={has_education} | emails={has_emails}")
        if not name_field:
            print(f"  {WARN} Person has no 'name' field — names may be blank after sync")
    except Exception as e:
        print(f"  {FAIL} get_person({pid}) failed: {e}")


# -----------------------------------------------------------------------
# Section 2: Database Integrity
# -----------------------------------------------------------------------
section("2. Database — Table Integrity")

engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)

with engine.connect() as conn:
    # Row counts
    tables = ["jobs", "candidates", "matches", "chat_sessions", "chat_messages"]
    print("\nRow counts:")
    counts = {}
    for t in tables:
        c = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
        counts[t] = c
        if t in ("chat_sessions", "chat_messages"):
            status = INFO
        else:
            status = PASS if c > 0 else WARN
        print(f"  {status} {t}: {c:,} rows")

    # DB vs Loxo sync comparison
    print("\nDB vs Loxo sync:")
    db_jobs = counts["jobs"]
    if total_loxo_jobs > 0:
        diff = abs(db_jobs - total_loxo_jobs)
        if diff <= 2:
            print(f"  {PASS} Jobs: DB={db_jobs}, Loxo={total_loxo_jobs} (in sync)")
        else:
            print(f"  {WARN} Jobs: DB={db_jobs}, Loxo={total_loxo_jobs} (gap={diff} — re-sync may be needed)")
    else:
        print(f"  {INFO} DB has {db_jobs} jobs (Loxo count unavailable)")

    # Job quality
    print("\nJob data quality:")
    total_jobs = counts["jobs"]
    no_title = conn.execute(text("SELECT COUNT(*) FROM jobs WHERE title IS NULL OR title=''")).scalar()
    no_desc = conn.execute(text("SELECT COUNT(*) FROM jobs WHERE description IS NULL OR description=''")).scalar()
    no_embed = conn.execute(text("SELECT COUNT(*) FROM jobs WHERE embedding IS NULL")).scalar()
    print(f"  {'PASS' if no_title==0 else WARN} Jobs with no title:       {no_title}/{total_jobs}")
    print(f"  {'PASS' if no_desc==0 else WARN} Jobs with no description:  {no_desc}/{total_jobs}")
    print(f"  {'PASS' if no_embed==0 else WARN} Jobs with no embedding:   {no_embed}/{total_jobs}")

    # All jobs listed
    print(f"\nAll {total_jobs} jobs in DB:")
    rows = conn.execute(text(
        "SELECT id, title, company, location FROM jobs ORDER BY title"
    )).fetchall()
    for r in rows:
        print(f"  {INFO} [{r.id}] {r.title} @ {r.company} ({r.location})")

    # Candidate quality
    print("\nCandidate data quality:")
    total_cands = counts["candidates"]
    no_name = conn.execute(text(
        "SELECT COUNT(*) FROM candidates WHERE first_name IS NULL AND last_name IS NULL"
    )).scalar()
    no_title_c = conn.execute(text(
        "SELECT COUNT(*) FROM candidates WHERE current_title IS NULL OR current_title=''"
    )).scalar()
    no_embed_c = conn.execute(text("SELECT COUNT(*) FROM candidates WHERE embedding IS NULL")).scalar()
    no_resume = conn.execute(text(
        "SELECT COUNT(*) FROM candidates WHERE resume_text IS NULL OR resume_text=''"
    )).scalar()
    with_email = conn.execute(text(
        "SELECT COUNT(*) FROM candidates WHERE email IS NOT NULL AND email != ''"
    )).scalar()
    with_location = conn.execute(text(
        "SELECT COUNT(*) FROM candidates WHERE location IS NOT NULL AND location != ''"
    )).scalar()

    print(f"  {'PASS' if no_name==0 else FAIL} Candidates with no name (first+last null): {no_name}/{total_cands}")
    print(f"  {'PASS' if no_title_c < total_cands*0.3 else WARN} Candidates with no current title:          {no_title_c}/{total_cands}")
    print(f"  {'PASS' if no_embed_c==0 else WARN} Candidates with no embedding:             {no_embed_c}/{total_cands}")
    print(f"  {INFO} Candidates with resume text:  {total_cands - no_resume}/{total_cands}")
    print(f"  {INFO} Candidates with email:        {with_email}/{total_cands}")
    print(f"  {INFO} Candidates with location:     {with_location}/{total_cands}")

    # Status distribution
    print("\nCandidate status distribution:")
    rows = conn.execute(text(
        "SELECT global_status, COUNT(*) cnt FROM candidates GROUP BY global_status ORDER BY cnt DESC"
    )).fetchall()
    for r in rows:
        print(f"  {INFO} {r.global_status}: {r.cnt:,}")

    # Sample candidates with names
    print("\nSample candidates (5):")
    sample = conn.execute(text(
        "SELECT id, first_name, last_name, current_title, location, global_status "
        "FROM candidates WHERE first_name IS NOT NULL ORDER BY last_name LIMIT 5"
    )).fetchall()
    for r in sample:
        print(f"  {INFO} [{r.id}] {r.first_name} {r.last_name} — {r.current_title} ({r.location}) [{r.global_status}]")


# -----------------------------------------------------------------------
# Section 3: Match Scores
# -----------------------------------------------------------------------
section("3. Match Scores — Coverage & Quality")

with engine.connect() as conn:
    total_matches = counts["matches"]
    jobs_with_matches = conn.execute(text("SELECT COUNT(DISTINCT job_id) FROM matches")).scalar()
    total_jobs_db = counts["jobs"]

    print(f"\nTotal pre-computed match records: {total_matches:,}")
    pct = int(jobs_with_matches / total_jobs_db * 100) if total_jobs_db else 0
    status = PASS if jobs_with_matches == total_jobs_db else WARN
    print(f"  {status} Jobs with at least one match score: {jobs_with_matches}/{total_jobs_db} ({pct}%)")

    if total_matches > 0:
        # Score distribution
        dist = conn.execute(text("""
            SELECT
                SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END)             AS excellent,
                SUM(CASE WHEN score >= 60 AND score < 80 THEN 1 ELSE 0 END) AS good,
                SUM(CASE WHEN score >= 40 AND score < 60 THEN 1 ELSE 0 END) AS moderate,
                SUM(CASE WHEN score >= 20 AND score < 40 THEN 1 ELSE 0 END) AS weak,
                SUM(CASE WHEN score < 20 THEN 1 ELSE 0 END)               AS poor,
                ROUND(AVG(score)::numeric, 1)                             AS avg_score,
                MIN(score)                                                AS min_score,
                MAX(score)                                                AS max_score
            FROM matches
        """)).fetchone()
        print(f"\nScore distribution ({total_matches:,} total):")
        print(f"  {INFO} Excellent (80-100): {dist.excellent:>5}")
        print(f"  {INFO} Good      (60-79):  {dist.good:>5}")
        print(f"  {INFO} Moderate  (40-59):  {dist.moderate:>5}")
        print(f"  {INFO} Weak      (20-39):  {dist.weak:>5}")
        print(f"  {INFO} Poor      (0-19):   {dist.poor:>5}")
        print(f"  {INFO} Avg score: {dist.avg_score} | Range: {dist.min_score}–{dist.max_score}")

        # Top 10 matches with names
        print("\nTop 10 match scores:")
        rows = conn.execute(text("""
            SELECT
                m.score,
                j.title         AS job_title,
                j.company,
                c.first_name,
                c.last_name,
                c.current_title AS cand_title,
                c.location,
                LEFT(m.reasoning, 100) AS reasoning_preview
            FROM matches m
            JOIN jobs j ON j.id = m.job_id
            JOIN candidates c ON c.id = m.candidate_id
            ORDER BY m.score DESC
            LIMIT 10
        """)).fetchall()
        for r in rows:
            cand_name = f"{r.first_name or ''} {r.last_name or ''}".strip()
            print(f"\n  Score {r.score:3d} | {r.job_title} @ {r.company}")
            print(f"           {cand_name} — {r.cand_title} ({r.location})")
            if r.reasoning_preview:
                print(f"           {r.reasoning_preview}...")

        # Per-job match summary (all jobs with scores)
        print("\n\nPer-job match summary:")
        rows = conn.execute(text("""
            SELECT
                j.id,
                j.title,
                j.company,
                COUNT(*)                         AS match_count,
                MAX(m.score)                     AS top_score,
                ROUND(AVG(m.score)::numeric, 1)  AS avg_score,
                (SELECT c.first_name || ' ' || c.last_name
                 FROM matches m2
                 JOIN candidates c ON c.id = m2.candidate_id
                 WHERE m2.job_id = j.id
                 ORDER BY m2.score DESC LIMIT 1)  AS top_candidate
            FROM matches m
            JOIN jobs j ON j.id = m.job_id
            GROUP BY j.id, j.title, j.company
            ORDER BY top_score DESC
        """)).fetchall()
        for r in rows:
            print(f"  {INFO} {r.title} @ {r.company}")
            print(f"       {r.match_count} matches | top={r.top_score} | avg={r.avg_score} | best={r.top_candidate}")

    # Jobs with NO match scores
    no_match_jobs = conn.execute(text("""
        SELECT j.id, j.title, j.company
        FROM jobs j
        LEFT JOIN matches m ON m.job_id = j.id
        WHERE m.job_id IS NULL
        ORDER BY j.title
    """)).fetchall()
    if no_match_jobs:
        print(f"\n  {WARN} Jobs with NO match scores ({len(no_match_jobs)}) — will compute nightly:")
        for r in no_match_jobs:
            print(f"  {INFO}   [{r.id}] {r.title} @ {r.company}")
    else:
        print(f"\n  {PASS} All jobs have at least one match score.")

engine.dispose()

print(f"\n{'='*60}")
print("  Check complete.")
print('='*60)
