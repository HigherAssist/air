from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm_models import Candidate, Job, RecruiterActivity
from app.db.session import get_db

router = APIRouter(prefix="/status", tags=["status"])


@router.get("")
async def get_status(db: AsyncSession = Depends(get_db)):
    """Return the latest Loxo ATS data sync timestamp across all synced tables."""
    jobs_max = await db.scalar(select(func.max(Job.last_synced_at)))
    cands_max = await db.scalar(select(func.max(Candidate.last_synced_at)))
    acts_max = await db.scalar(select(func.max(RecruiterActivity.synced_at)))

    timestamps = [t for t in [jobs_max, cands_max, acts_max] if t is not None]
    latest = max(timestamps) if timestamps else None

    return {
        "latest_loxo_sync": latest.isoformat() if latest else None,
    }
