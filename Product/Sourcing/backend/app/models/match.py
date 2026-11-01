from typing import Optional
from pydantic import BaseModel, Field


class MatchResult(BaseModel):
    """A scored match between a job and a candidate."""

    job_id: int
    candidate_id: int
    candidate_name: Optional[str] = None
    candidate_title: Optional[str] = None
    candidate_location: Optional[str] = None
    score: int = Field(..., ge=0, le=100, description="Match score 0-100")
    reasoning: Optional[str] = None
    vector_similarity: Optional[float] = None
    computed_at: Optional[str] = None

    model_config = {"from_attributes": True}


class MatchRequest(BaseModel):
    """Request to compute a match score on demand."""

    job_id: int
    candidate_id: int
