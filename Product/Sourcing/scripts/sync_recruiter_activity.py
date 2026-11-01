#!/usr/bin/env python3
"""
Sync recruiter activity from Loxo into the sourcing database.

Populates:
  recruiters           — all Loxo users (recruiters)
  recruiter_activities — all person_event activity records

Usage:
    # Initial load: last 6 months
    python scripts/sync_recruiter_activity.py --days 180

    # Specific date range
    python scripts/sync_recruiter_activity.py --since 2025-09-15

    # Incremental (nightly cron default: yesterday)
    python scripts/sync_recruiter_activity.py

    # All history (no date filter)
    python scripts/sync_recruiter_activity.py --all
"""
import argparse
import logging
import os
import ssl
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

import sqlalchemy
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.orm_models import Base
from data_sync.loxo.client import LoxoClient
from data_sync.loxo.sync_recruiter_activity import sync_recruiters, sync_recruiter_activities

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def _make_engine(settings):
    """Build a synchronous SQLAlchemy engine with RDS SSL support."""
    db_url = settings.DATABASE_URL_SYNC
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    return create_engine(
        db_url,
        connect_args={"sslmode": "require", "ssl": ssl_ctx} if "rds.amazonaws.com" in db_url else {},
        pool_pre_ping=True,
    )


def ensure_tables(engine) -> None:
    """Create recruiters and recruiter_activities tables if they don't exist."""
    Base.metadata.create_all(engine, tables=[
        Base.metadata.tables["recruiters"],
        Base.metadata.tables["recruiter_activities"],
    ])
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_recruiter_activities_date "
            "ON recruiter_activities (event_date DESC)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_recruiter_activities_recruiter_date "
            "ON recruiter_activities (recruiter_id, event_date DESC)"
        ))
        conn.commit()
    logger.info("Tables and indexes verified.")


def main():
    parser = argparse.ArgumentParser(description="Sync Loxo recruiter activity into sourcing DB")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--since", metavar="DATE", help="Sync events on or after this date (YYYY-MM-DD)")
    group.add_argument("--days", type=int, metavar="N", help="Sync events from the last N days")
    group.add_argument("--all", dest="all_history", action="store_true", help="Sync all history (no date filter)")
    args = parser.parse_args()

    # Determine after_date
    if args.all_history:
        after_date = None
    elif args.since:
        after_date = args.since
    elif args.days:
        after_date = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%Y-%m-%d")
    else:
        # Default: yesterday (nightly incremental mode)
        after_date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    logger.info("Starting recruiter activity sync | after_date=%s", after_date or "all")

    settings = get_settings()
    engine = _make_engine(settings)

    # Ensure new tables exist before syncing
    ensure_tables(engine)

    with LoxoClient() as loxo:
        with Session(engine) as db:
            recruiters_count = sync_recruiters(loxo, db)
            events_count = sync_recruiter_activities(loxo, db, after_date=after_date)

    logger.info(
        "Sync complete — %d recruiters, %d activity events.",
        recruiters_count, events_count,
    )
    engine.dispose()


if __name__ == "__main__":
    main()
