from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm_models import Candidate
from app.db.session import get_db
from app.models.candidate import CandidateDetail, CandidateSummary

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("", response_model=List[CandidateSummary])
async def list_candidates(
    status: Optional[str] = Query(None, description="Filter by global_status"),
    limit: int = Query(50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List candidates with optional status filter."""
    query = select(Candidate).order_by(Candidate.last_name)
    if status:
        query = query.where(Candidate.global_status == status.lower())
    query = query.limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{candidate_id}", response_model=CandidateDetail)
async def get_candidate(candidate_id: int, db: AsyncSession = Depends(get_db)):
    """Return full profile for a single candidate."""
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Candidate {candidate_id} not found")
    return candidate
