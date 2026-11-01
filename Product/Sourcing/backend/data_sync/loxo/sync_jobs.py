"""
Sync active jobs from Loxo into the local PostgreSQL database.
Upserts job records and regenerates embeddings when description changes.
"""
import logging
import re
import sys
from datetime import datetime, timezone
from typing import List

sys.path.insert(0, "/app")  # Allow imports when run as ECS task

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SALARY_TYPE_MAP = {1: "annual", 2: "hourly", 3: "monthly", 4: "weekly", 5: "daily"}


def _strip_html(html: str) -> str:
    if not html:
        return ""
    return re.sub(r"<[^>]+>", " ", html).strip()


def _derive_location(job: dict) -> str:
    parts = []
    if job.get("city"):
        parts.append(job["city"])
    if job.get("state_code") or job.get("state"):
        parts.append(job.get("state_code") or job["state"])
    if job.get("country_code") and job.get("country_code") != "US":
        parts.append(job["country_code"])
    if job.get("macro_address") and not parts:
        parts.append(job["macro_address"])
    return ", ".join(parts)


def _safe_float(val) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def upsert_job(job_data: dict, db: Session, embedder) -> None:
    """Upsert a single job record into the DB, regenerating embeddings if needed."""
    from app.db.orm_models import Job

    job_id = int(job_data["id"])
    description_html = job_data.get("description") or ""
    description = _strip_html(description_html)
    notes_html = job_data.get("internal_notes") or ""
    notes = _strip_html(notes_html)
    location = _derive_location(job_data)
    salary_type = SALARY_TYPE_MAP.get(job_data.get("salary_type_id"), "")

    existing: Job = db.get(Job, job_id)
    needs_embed = True

    if existing:
        needs_embed = (
            existing.description != description
            or existing.internal_notes != notes
            or existing.embedding is None
        )
        existing.title = job_data.get("title", "")
        existing.company = job_data.get("company", {}).get("name") if isinstance(job_data.get("company"), dict) else job_data.get("company")
        existing.city = job_data.get("city")
        existing.state = job_data.get("state_code") or job_data.get("state")
        existing.country = job_data.get("country_code")
        existing.location = location
        existing.job_type = job_data.get("job_type", {}).get("name") if isinstance(job_data.get("job_type"), dict) else None
        existing.description = description
        existing.description_html = description_html
        existing.internal_notes = notes
        existing.pay_rate_min = _safe_float(job_data.get("pay_rate"))
        existing.pay_rate_max = _safe_float(job_data.get("bill_rate"))
        existing.salary_min = _safe_float(job_data.get("salary_min"))
        existing.salary_max = _safe_float(job_data.get("salary_max"))
        existing.salary_type = salary_type
        existing.remote_work_allowed = bool(job_data.get("remote_work_allowed"))
        existing.status = job_data.get("status", {}).get("name") if isinstance(job_data.get("status"), dict) else None
        existing.pipeline_counts = job_data.get("counts")
        existing.raw_data = job_data
        existing.last_synced_at = datetime.now(timezone.utc)
        if needs_embed:
            existing.embedding = embedder.embed_job(existing)
    else:
        company = job_data.get("company", {})
        company_name = company.get("name") if isinstance(company, dict) else company
        job_type = job_data.get("job_type", {})
        job_type_name = job_type.get("name") if isinstance(job_type, dict) else None
        status_data = job_data.get("status", {})
        status_name = status_data.get("name") if isinstance(status_data, dict) else None

        new_job = Job(
            id=job_id,
            title=job_data.get("title", ""),
            company=company_name,
            city=job_data.get("city"),
            state=job_data.get("state_code") or job_data.get("state"),
            country=job_data.get("country_code"),
            location=location,
            job_type=job_type_name,
            description=description,
            description_html=description_html,
            internal_notes=notes,
            pay_rate_min=_safe_float(job_data.get("pay_rate")),
            pay_rate_max=_safe_float(job_data.get("bill_rate")),
            salary_min=_safe_float(job_data.get("salary_min")),
            salary_max=_safe_float(job_data.get("salary_max")),
            salary_type=salary_type,
            remote_work_allowed=bool(job_data.get("remote_work_allowed")),
            status=status_name,
            pipeline_counts=job_data.get("counts"),
            raw_data=job_data,
            last_synced_at=datetime.now(timezone.utc),
        )
        new_job.embedding = embedder.embed_job(new_job)
        db.add(new_job)

    db.commit()


def sync_job_pipeline(job_id: int, loxo_client, db: Session, embedder, s3_bucket: str = None) -> int:
    """
    Sync the Loxo pipeline for a single job — candidates the recruiter has explicitly associated.
    Ensures every pipeline candidate exists in our candidates table (syncs them if not).
    Removes stale entries for candidates no longer in the Loxo pipeline.
    Returns count of pipeline candidates.
    """
    from app.db.orm_models import Candidate, JobPipeline
    from data_sync.loxo.sync_candidates import upsert_candidate, EXCLUDED_STATUS_IDS

    pipeline_ids = set()

    for pc in loxo_client.iter_job_candidates(job_id):
        # pc["id"] is the pipeline-entry ID; the actual person lives in pc["person"]["id"]
        person = pc.get("person") or {}
        candidate_id = person.get("id")
        if not candidate_id:
            continue
        candidate_id = int(candidate_id)
        pipeline_ids.add(candidate_id)

        # Ensure candidate exists in our DB; sync if missing
        if not db.get(Candidate, candidate_id):
            try:
                person_data = loxo_client.get_person(candidate_id)
                status_id_person = (person_data.get("person_global_status") or {}).get("id")
                if status_id_person not in EXCLUDED_STATUS_IDS:
                    upsert_candidate(person_data, status_id_person, db, embedder,
                                     loxo_client=loxo_client, s3_bucket=s3_bucket)
            except Exception as e:
                logger.warning("Could not sync pipeline candidate %s for job %s: %s", candidate_id, job_id, e)
                # Fall through — still record this candidate in job_pipeline even if their profile is unavailable

        # Upsert pipeline record
        stage_data = pc.get("stage") or {}
        stage_name = stage_data.get("name") if isinstance(stage_data, dict) else None

        existing = db.execute(
            select(JobPipeline).where(
                JobPipeline.job_id == job_id,
                JobPipeline.candidate_id == candidate_id,
            )
        ).scalar_one_or_none()

        if existing:
            existing.pipeline_stage = stage_name
        else:
            db.add(JobPipeline(job_id=job_id, candidate_id=candidate_id, pipeline_stage=stage_name))

    # Remove candidates no longer in the Loxo pipeline
    if pipeline_ids:
        stale = db.execute(
            select(JobPipeline).where(
                JobPipeline.job_id == job_id,
                JobPipeline.candidate_id.notin_(pipeline_ids),
            )
        ).scalars().all()
    else:
        stale = db.execute(
            select(JobPipeline).where(JobPipeline.job_id == job_id)
        ).scalars().all()

    for s in stale:
        db.delete(s)

    db.commit()
    logger.info("Job %s pipeline: %d candidates synced, %d stale removed.", job_id, len(pipeline_ids), len(stale))
    return len(pipeline_ids)


def sync_all_jobs(loxo_client, db: Session, embedder, status_id: int = 6875) -> int:
    """
    Pull all active jobs from Loxo, upsert into DB, and remove any DB jobs
    no longer present in Loxo's active list.
    Returns the count of active jobs synced.
    """
    from app.db.orm_models import Job, Match

    jobs = loxo_client.get_all_active_jobs(status_id=status_id)
    logger.info("Syncing %d active jobs from Loxo...", len(jobs))

    active_ids = set()
    for job_data in jobs:
        # Fetch full detail (summary endpoint may be missing description)
        try:
            full = loxo_client.get_job(job_data["id"])
        except Exception as e:
            logger.warning("Could not fetch full detail for job %s: %s", job_data["id"], e)
            full = job_data
        upsert_job(full, db, embedder)
        job_id = int(job_data["id"])
        active_ids.add(job_id)
        try:
            sync_job_pipeline(job_id, loxo_client, db, embedder)
        except Exception as e:
            logger.warning("Pipeline sync failed for job %s: %s", job_id, e)

    # Remove DB jobs that are no longer active in Loxo
    all_db_ids = {row[0] for row in db.execute(select(Job.id)).fetchall()}
    stale_ids = all_db_ids - active_ids
    if stale_ids:
        logger.info("Removing %d stale jobs from DB: %s", len(stale_ids), sorted(stale_ids))
        for job_id in stale_ids:
            db.execute(Match.__table__.delete().where(Match.job_id == job_id))
            db.execute(Job.__table__.delete().where(Job.id == job_id))
        db.commit()

    logger.info("Jobs sync complete: %d active, %d removed.", len(jobs), len(stale_ids))
    return len(jobs)
