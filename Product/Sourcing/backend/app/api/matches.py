from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm_models import Candidate, Job, Match
from app.db.session import get_db
from app.models.match import MatchRequest, MatchResult
from app.services import matcher

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("/{job_id}", response_model=List[MatchResult])
async def get_top_matches(
    job_id: int,
    limit: int = Query(10, le=50),
    min_score: int = Query(0, ge=0, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Return pre-computed top candidate matches for a job, ranked by score."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    result = await db.execute(
        select(Match, Candidate)
        .join(Candidate, Match.candidate_id == Candidate.id)
        .where(Match.job_id == job_id, Match.score >= min_score)
        .order_by(Match.score.desc())
        .limit(limit)
    )
    rows = result.all()

    matches = []
    for m, c in rows:
        matches.append(
            MatchResult(
                job_id=m.job_id,
                candidate_id=m.candidate_id,
                candidate_name=f"{c.first_name or ''} {c.last_name or ''}".strip(),
                candidate_title=c.current_title,
                candidate_location=c.location,
                score=m.score,
                reasoning=m.reasoning,
                vector_similarity=m.vector_similarity,
                computed_at=m.computed_at.isoformat() if m.computed_at else None,
            )
        )
    return matches


@router.post("/compute", response_model=MatchResult)
async def compute_match(req: MatchRequest, db: AsyncSession = Depends(get_db)):
    """Compute an on-demand LLM match score for a specific job-candidate pair."""
    job = await db.get(Job, req.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {req.job_id} not found")
    candidate = await db.get(Candidate, req.candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Candidate {req.candidate_id} not found")

    m = await matcher.score_pair(job, candidate, db, store=True)
    return MatchResult(
        job_id=m.job_id,
        candidate_id=m.candidate_id,
        candidate_name=f"{candidate.first_name or ''} {candidate.last_name or ''}".strip(),
        candidate_title=candidate.current_title,
        candidate_location=candidate.location,
        score=m.score,
        reasoning=m.reasoning,
        vector_similarity=m.vector_similarity,
        computed_at=m.computed_at.isoformat() if m.computed_at else None,
    )
