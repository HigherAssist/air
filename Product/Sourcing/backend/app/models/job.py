from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class JobSummary(BaseModel):
    id: int
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    pay_rate_min: Optional[float] = None
    pay_rate_max: Optional[float] = None
    salary_type: Optional[str] = None
    remote_work_allowed: bool = False

    model_config = {"from_attributes": True}


class JobDetail(JobSummary):
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None
    internal_notes: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    pipeline_counts: Optional[List[Dict[str, Any]]] = None
    last_synced_at: Optional[datetime] = None
