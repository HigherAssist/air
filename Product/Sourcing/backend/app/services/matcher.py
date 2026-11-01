"""
Core matching algorithm.

Two-phase approach:
  1. Vector similarity (pgvector) — fast pre-filter, no LLM cost
  2. LLM scoring (Groq) — deep semantic evaluation of top-N candidates

The matcher also handles on-demand single-pair scoring.
"""
import asyncio
import json
import logging
import re
from typing import List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.orm_models import Candidate, Job, Match
from app.services import embeddings as emb
from app.services import groq_client
from app.services.prompts import MATCHING_SYSTEM_PROMPT, PROMPT_VERSION

logger = logging.getLogger(__name__)


def _build_match_prompt(job: Job, candidate: Candidate) -> list:
    """Build the messages list for a single job-candidate match."""

    def _fmt_job(j: Job) -> str:
        parts = [
            f"Job Title: {j.title}",
            f"Company: {j.company or 'Not disclosed'}",
            f"Location: {j.location or 'Not specified'}",
            f"Remote: {'Yes' if j.remote_work_allowed else 'No'}",
            f"Pay Rate: {j.pay_rate_min or j.salary_min or 'Not specified'}",
            f"Description:\n{(j.description or '')[:3000]}",
        ]
        if j.internal_notes:
            parts.append(f"Internal Notes (recruiter context):\n{j.internal_notes[:1000]}")
        return "\n".join(parts)

    def _fmt_candidate(c: Candidate) -> str:
        name = f"{c.first_name or ''} {c.last_name or ''}".strip()
        parts = [
            f"Name: {name}",
            f"Current Title: {c.current_title or 'Unknown'}",
            f"Current Company: {c.current_company or 'Unknown'}",
            f"Location: {c.location or 'Unknown'}",
            f"Skills: {', '.join(c.skills or []) or 'Not specified'}",
        ]

        # Work history summary
        for i, jp in enumerate((c.job_profiles or [])[:5]):
            if isinstance(jp, dict):
                role = jp.get("title") or jp.get("name", "")
                org = jp.get("company_name") or jp.get("org_name", "")
                start = jp.get("start_date") or jp.get("start_year", "")
                end = jp.get("end_date") or jp.get("end_year", "current")
                parts.append(f"Past Role {i+1}: {role} at {org} ({start}–{end})")

        # Education summary
        for edu in (c.education_profiles or [])[:2]:
            if isinstance(edu, dict):
                degree = edu.get("degree", "")
                school = edu.get("school_name") or edu.get("school", "")
                parts.append(f"Education: {degree} from {school}")

        # Resume text (truncated)
        if c.resume_text:
            parts.append(f"Resume Extract:\n{c.resume_text[:2500]}")

        return "\n".join(parts)

    return [
        {"role": "system", "content": MATCHING_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Please evaluate the following candidate against the job description "
                "and return a JSON score and reasoning.\n\n"
                f"=== JOB ===\n{_fmt_job(job)}\n\n"
                f"=== CANDIDATE ===\n{_fmt_candidate(candidate)}"
            ),
        },
    ]


def _parse_score_response(raw: str) -> tuple[int, str]:
    """Extract score and reasoning from LLM JSON response. Returns (score, reasoning)."""
    try:
        # Try direct JSON parse first
        data = json.loads(raw)
        score = int(data.get("score", 0))
        reasoning = data.get("reasoning", "")
        return max(0, min(100, score)), reasoning
    except (json.JSONDecodeError, ValueError):
        pass

    # Try regex extraction if JSON is embedded in prose
    score_match = re.search(r'"score"\s*:\s*(\d+)', raw)
    reasoning_match = re.search(r'"reasoning"\s*:\s*"([^"]+)"', raw)
    if score_match:
        score = int(score_match.group(1))
        reasoning = reasoning_match.group(1) if reasoning_match else raw[:300]
        return max(0, min(100, score)), reasoning

    logger.warning("Could not parse match score from LLM response: %s", raw[:200])
    return 0, "Could not parse LLM response."


async def score_pair(
    job: Job,
    candidate: Candidate,
    db: AsyncSession,
    vector_similarity: Optional[float] = None,
    store: bool = True,
) -> Match:
    """
    Score a single job-candidate pair using the LLM.
    If store=True, upserts the result into the matches table.
    Returns a Match ORM object (not yet committed if store=False).
    """
    settings = get_settings()
    messages = _build_match_prompt(job, candidate)

    raw = await groq_client.json_completion(
        messages=messages,
        max_tokens=400,
        timeout=settings.GROQ_TIMEOUT_SECONDS,
    )
    score, reasoning = _parse_score_response(raw)

    if store:
        # Upsert: update if exists, insert if not
        existing = await db.execute(
            select(Match).where(Match.job_id == job.id, Match.candidate_id == candidate.id)
        )
        match = existing.scalar_one_or_none()
        if match:
            match.score = score
            match.reasoning = reasoning
            match.vector_similarity = vector_similarity
            match.prompt_version = PROMPT_VERSION
        else:
            match = Match(
                job_id=job.id,
                candidate_id=candidate.id,
                score=score,
                reasoning=reasoning,
                vector_similarity=vector_similarity,
                prompt_version=PROMPT_VERSION,
            )
            db.add(match)
        await db.commit()
        await db.refresh(match)
    else:
        match = Match(
            job_id=job.id,
            candidate_id=candidate.id,
            score=score,
            reasoning=reasoning,
            vector_similarity=vector_similarity,
            prompt_version=PROMPT_VERSION,
        )

    return match


async def vector_search_candidates(
    job: Job,
    db: AsyncSession,
    limit: int = 30,
) -> List[tuple]:
    """
    Find the top-N candidate matches for a job using pgvector cosine similarity.
    Returns list of (Candidate, similarity_score) tuples.
    """
    if job.embedding is None:
        logger.warning("Job %d has no embedding — regenerating.", job.id)
        job.embedding = emb.embed_job(job)
        await db.commit()

    # pgvector cosine similarity: 1 - cosine_distance
    # The <=> operator returns cosine distance (0=identical, 2=opposite)
    result = await db.execute(
        text(
            """
            SELECT c.id, 1 - (c.embedding <=> CAST(:vec AS vector)) AS similarity
            FROM candidates c
            WHERE c.embedding IS NOT NULL
            ORDER BY c.embedding <=> CAST(:vec AS vector)
            LIMIT :limit
            """
        ),
        {"vec": "[" + ",".join(str(v) for v in job.embedding) + "]", "limit": limit},
    )
    rows = result.fetchall()

    candidates = []
    for row in rows:
        candidate = await db.get(Candidate, row[0])
        if candidate:
            candidates.append((candidate, float(row[1])))
    return candidates


async def vector_search_by_query(
    query: str,
    db: AsyncSession,
    location_filter: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 10,
) -> List[Candidate]:
    """
    Search candidates by free-text query using embedding similarity.
    Used by the chatbot when the recruiter asks natural-language questions.
    """
    limit = min(limit, 25)
    query_embedding = emb.embed_text(query)

    conditions = "c.embedding IS NOT NULL"
    params: dict = {"vec": "[" + ",".join(str(v) for v in query_embedding) + "]", "limit": limit}

    if location_filter:
        conditions += " AND LOWER(c.location) LIKE :location"
        params["location"] = f"%{location_filter.lower()}%"

    if status_filter:
        conditions += " AND c.global_status = :status"
        params["status"] = status_filter.lower()

    sql = f"""
        SELECT c.id
        FROM candidates c
        WHERE {conditions}
        ORDER BY c.embedding <=> CAST(:vec AS vector)
        LIMIT :limit
    """
    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    candidates = []
    for row in rows:
        candidate = await db.get(Candidate, row[0])
        if candidate:
            candidates.append(candidate)
    return candidates
