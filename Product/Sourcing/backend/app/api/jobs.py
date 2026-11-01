from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm_models import Job
from app.db.session import get_db
from app.models.job import JobDetail, JobSummary

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=List[JobSummary])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    """Return all active jobs in the database."""
    result = await db.execute(select(Job).order_by(Job.title))
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobDetail)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Return full detail for a single job."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job
