"""
Embedding service using sentence-transformers (runs locally, no API cost).
The model is loaded once at startup and reused for all calls.
"""
import logging
from functools import lru_cache
from typing import List

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_model():
    """Load the sentence-transformers model once and cache it."""
    from sentence_transformers import SentenceTransformer
    settings = get_settings()
    logger.info("Loading embedding model: %s", settings.EMBEDDING_MODEL)
    model = SentenceTransformer(settings.EMBEDDING_MODEL)
    logger.info("Embedding model loaded.")
    return model


def embed_text(text: str) -> List[float]:
    """Embed a single text string. Returns a list of floats."""
    if not text or not text.strip():
        settings = get_settings()
        return [0.0] * settings.EMBEDDING_DIM
    model = _get_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def embed_job(job) -> List[float]:
    """Build a rich embedding text from a job ORM model or dict."""
    if hasattr(job, "__dict__"):
        title = job.title or ""
        company = job.company or ""
        location = job.location or ""
        description = job.description or ""
        notes = job.internal_notes or ""
        remote = "Remote work allowed." if job.remote_work_allowed else ""
    else:
        title = job.get("title", "")
        company = job.get("company", "")
        location = job.get("location", "")
        description = job.get("description", "")
        notes = job.get("internal_notes", "")
        remote = "Remote work allowed." if job.get("remote_work_allowed") else ""

    text = (
        f"Job Title: {title}. "
        f"Company: {company}. "
        f"Location: {location}. "
        f"{remote} "
        f"Description: {description[:3000]} "
        f"Internal Notes: {notes[:1000]}"
    )
    return embed_text(text)


def embed_candidate(candidate) -> List[float]:
    """Build a rich embedding text from a candidate ORM model or dict."""
    if hasattr(candidate, "__dict__"):
        name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip()
        title = candidate.current_title or ""
        company = candidate.current_company or ""
        location = candidate.location or ""
        skills = ", ".join(candidate.skills or [])
        resume = candidate.resume_text or ""
        job_profiles = candidate.job_profiles or []
        education = candidate.education_profiles or []
    else:
        name = f"{candidate.get('first_name', '')} {candidate.get('last_name', '')}".strip()
        title = candidate.get("current_title", "")
        company = candidate.get("current_company", "")
        location = candidate.get("location", "")
        skills = ", ".join(candidate.get("skills", []) or [])
        resume = candidate.get("resume_text", "")
        job_profiles = candidate.get("job_profiles", []) or []
        education = candidate.get("education_profiles", []) or []

    # Summarize work history
    history_parts = []
    for jp in (job_profiles or [])[:5]:
        if isinstance(jp, dict):
            role = jp.get("title") or jp.get("name", "")
            org = jp.get("company_name") or jp.get("org_name", "")
            if role or org:
                history_parts.append(f"{role} at {org}".strip(" at"))
    history = "; ".join(history_parts)

    # Summarize education
    edu_parts = []
    for edu in (education or [])[:3]:
        if isinstance(edu, dict):
            degree = edu.get("degree", "")
            school = edu.get("school_name") or edu.get("school", "")
            if degree or school:
                edu_parts.append(f"{degree} from {school}".strip(" from"))
    edu_str = "; ".join(edu_parts)

    text = (
        f"Candidate: {name}. "
        f"Current Role: {title} at {company}. "
        f"Location: {location}. "
        f"Skills: {skills}. "
        f"Work History: {history}. "
        f"Education: {edu_str}. "
        f"Resume: {resume[:2500]}"
    )
    return embed_text(text)
