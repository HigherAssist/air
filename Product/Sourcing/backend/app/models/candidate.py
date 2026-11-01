from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class CandidateSummary(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    current_title: Optional[str] = None
    current_company: Optional[str] = None
    location: Optional[str] = None
    global_status: Optional[str] = None
    email: Optional[str] = None

    model_config = {"from_attributes": True}

    @property
    def full_name(self) -> str:
        return f"{self.first_name or ''} {self.last_name or ''}".strip()


class CandidateDetail(CandidateSummary):
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    skills: Optional[List[str]] = None
    linkedin_url: Optional[str] = None
    resume_text: Optional[str] = None
    job_profiles: Optional[List[Dict[str, Any]]] = None
    education_profiles: Optional[List[Dict[str, Any]]] = None
    last_synced_at: Optional[datetime] = None
