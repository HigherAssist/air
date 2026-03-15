#!/usr/bin/env python3
"""
Verify recruiter activity data in the sourcing database.

Prints a summary report:
  - Recruiter list with total activity counts (30 days / 6 months / all-time)
  - Activity breakdown by category per recruiter (last 30 days)
  - Most active jobs (last 30 days)
  - Recent sample activities with notes

Usage:
    python scripts/check_recruiter_data.py
    python scripts/check_recruiter_data.py --days 90
    python scripts/check_recruiter_data.py --recruiter "Marshall"
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, func, text, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.orm_models import Recruiter, RecruiterActivity, Job


def _make_engine(settings):
    return create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)


def _hr(char="-", width=72):
    print(char * width)


def run_report(db: Session, days: int = 30, recruiter_filter: str = None):
    now = datetime.now(timezone.utc)
    since_short = now - timedelta(days=days)
    since_long = now - timedelta(days=180)

    _hr("=")
    print(f"  RECRUITER ACTIVITY REPORT  |  last {days} days  |  {now.strftime('%Y-%m-%d %H:%M UTC')}")
    _hr("=")

    # -----------------------------------------------------------------------
    # 1. Recruiter summary table
    # -----------------------------------------------------------------------
    print("\n── RECRUITERS ──────────────────────────────────────────────────────────")
    print(f"{'Name':<30} {'Last '+str(days)+'d':>10} {'Last 180d':>10} {'All-time':>10}")
    _hr()

    recruiters = db.execute(select(Recruiter).order_by(Recruiter.name)).scalars().all()
    for r in recruiters:
        if recruiter_filter and recruiter_filter.lower() not in r.name.lower():
            continue

        short_count = db.execute(
            select(func.count()).select_from(RecruiterActivity)
            .where(RecruiterActivity.recruiter_id == r.id)
            .where(RecruiterActivity.event_date >= since_short)
        ).scalar()

        long_count = db.execute(
            select(func.count()).select_from(RecruiterActivity)
            .where(RecruiterActivity.recruiter_id == r.id)
            .where(RecruiterActivity.event_date >= since_long)
        ).scalar()

        all_count = db.execute(
            select(func.count()).select_from(RecruiterActivity)
            .where(RecruiterActivity.recruiter_id == r.id)
        ).scalar()

        print(f"{r.name:<30} {short_count:>10,} {long_count:>10,} {all_count:>10,}")

    # Unattributed (no recruiter_id)
    unattr = db.execute(
        select(func.count()).select_from(RecruiterActivity)
        .where(RecruiterActivity.recruiter_id == None)
        .where(RecruiterActivity.event_date >= since_short)
    ).scalar()
    if unattr:
        print(f"{'(unattributed)':<30} {unattr:>10,}")

    # -----------------------------------------------------------------------
    # 2. Activity category breakdown per recruiter (last N days)
    # -----------------------------------------------------------------------
    print(f"\n── ACTIVITY CATEGORIES (last {days} days) ──────────────────────────────")
    rows = db.execute(
        select(
            RecruiterActivity.recruiter_name,
            RecruiterActivity.activity_category,
            func.count().label("cnt"),
        )
        .where(RecruiterActivity.event_date >= since_short)
        .group_by(RecruiterActivity.recruiter_name, RecruiterActivity.activity_category)
        .order_by(RecruiterActivity.recruiter_name, func.count().desc())
    ).all()

    current_recruiter = None
    for row in rows:
        if recruiter_filter and (not row.recruiter_name or recruiter_filter.lower() not in row.recruiter_name.lower()):
            continue
        if row.recruiter_name != current_recruiter:
            print(f"\n  {row.recruiter_name or '(unattributed)'}:")
            current_recruiter = row.recruiter_name
        print(f"    {row.activity_category or 'Other':<35} {row.cnt:>5,}")

    # -----------------------------------------------------------------------
    # 3. Most active jobs (last N days)
    # -----------------------------------------------------------------------
    print(f"\n── TOP JOBS BY ACTIVITY (last {days} days) ─────────────────────────────")
    job_rows = db.execute(
        select(
            RecruiterActivity.job_id,
            func.count().label("cnt"),
        )
        .where(RecruiterActivity.event_date >= since_short)
        .where(RecruiterActivity.job_id != None)
        .group_by(RecruiterActivity.job_id)
        .order_by(func.count().desc())
        .limit(15)
    ).all()

    # Fetch job titles for known jobs
    job_ids = [r.job_id for r in job_rows]
    job_title_map = {}
    if job_ids:
        jobs = db.execute(select(Job.id, Job.title).where(Job.id.in_(job_ids))).all()
        job_title_map = {j.id: j.title for j in jobs}

    print(f"{'Job':<55} {'Activities':>10}")
    _hr()
    for row in job_rows:
        title = job_title_map.get(row.job_id, f"(Loxo job {row.job_id})")[:54]
        print(f"{title:<55} {row.cnt:>10,}")

    # -----------------------------------------------------------------------
    # 4. Recent sample activities (with notes)
    # -----------------------------------------------------------------------
    print(f"\n── RECENT ACTIVITIES WITH NOTES (last 7 days) ──────────────────────────")
    since_week = now - timedelta(days=7)
    sample = db.execute(
        select(RecruiterActivity)
        .where(RecruiterActivity.event_date >= since_week)
        .where(RecruiterActivity.notes != None)
        .where(RecruiterActivity.notes != "")
        .order_by(RecruiterActivity.event_date.desc())
        .limit(10)
    ).scalars().all()

    if not sample:
        print("  No activities with notes in the last 7 days.")
    for act in sample:
        date_str = act.event_date.strftime("%Y-%m-%d") if act.event_date else "?"
        print(f"\n  [{date_str}] {act.recruiter_name or '?'} — {act.activity_type_name or '?'}"
              f"  (job={act.job_id}, candidate={act.candidate_id})")
        if act.notes:
            print(f"    Note: {act.notes[:200]}")

    # -----------------------------------------------------------------------
    # 5. Overall totals
    # -----------------------------------------------------------------------
    print(f"\n── TOTALS ──────────────────────────────────────────────────────────────")
    total = db.execute(select(func.count()).select_from(RecruiterActivity)).scalar()
    recent = db.execute(
        select(func.count()).select_from(RecruiterActivity)
        .where(RecruiterActivity.event_date >= since_short)
    ).scalar()
    oldest = db.execute(
        select(func.min(RecruiterActivity.event_date))
    ).scalar()
    newest = db.execute(
        select(func.max(RecruiterActivity.event_date))
    ).scalar()

    print(f"  Total activity records in DB: {total:,}")
    print(f"  Records in last {days} days:    {recent:,}")
    if oldest:
        print(f"  Date range: {oldest.strftime('%Y-%m-%d')} → {newest.strftime('%Y-%m-%d')}")
    _hr("=")


def main():
    parser = argparse.ArgumentParser(description="Check recruiter activity data in sourcing DB")
    parser.add_argument("--days", type=int, default=30, help="Short window in days (default 30)")
    parser.add_argument("--recruiter", metavar="NAME", help="Filter to a specific recruiter name")
    args = parser.parse_args()

    settings = get_settings()
    engine = _make_engine(settings)

    with Session(engine) as db:
        run_report(db, days=args.days, recruiter_filter=args.recruiter)

    engine.dispose()


if __name__ == "__main__":
    main()
