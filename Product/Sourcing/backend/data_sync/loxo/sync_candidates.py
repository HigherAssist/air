"""
Sync person candidates from Loxo into the local database.
Processes Option B status IDs, fetches full profiles, handles resumes.
"""
import logging
import sys
from datetime import datetime, timezone
from typing import List, Optional

logger = logging.getLogger(__name__)


def _clean(value):
    """Strip NUL bytes from strings — PostgreSQL rejects \x00 in text columns."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    return value

# All statuses except Do Not Contact (30205) and Bad Data (30206)
DEFAULT_STATUS_IDS = [
    30198,  # Uncontacted
    30199,  # Contacted
    30200,  # Applied
    30201,  # Replied
    30202,  # In Progress
    30203,  # Nurture
    30204,  # Unresponsive
    30207,  # Hired
]

STATUS_NAMES = {
    30198: "uncontacted",
    30199: "contacted",
    30200: "applied",
    30201: "replied",
    30202: "in_progress",
    30203: "nurture",
    30204: "unresponsive",
    30207: "hired",
}


def _derive_location(person: dict) -> str:
    parts = []
    if person.get("city"):
        parts.append(person["city"])
    if person.get("state"):
        parts.append(person["state"])
    if person.get("country") and person.get("country") != "United States":
        parts.append(person["country"])
    return ", ".join(p for p in parts if p)


def _extract_primary_email(person: dict) -> Optional[str]:
    emails = person.get("emails") or []
    for e in emails:
        if isinstance(e, dict) and e.get("value"):
            return e["value"]
    return None


def _extract_primary_phone(person: dict) -> Optional[str]:
    phones = person.get("phones") or []
    for p in phones:
        if isinstance(p, dict) and p.get("value"):
            return p["value"]
    return None


def _extract_skills(person: dict) -> List[str]:
    skillsets = person.get("skillsets") or []
    skills = []
    for s in skillsets:
        if isinstance(s, dict):
            name = s.get("name") or s.get("skill_name")
            if name:
                skills.append(str(name))
    return skills


def _infer_current_role(person: dict) -> tuple:
    """Infer current title and company from job_profiles (most recent first)."""
    profiles = person.get("job_profiles") or []
    for jp in profiles:
        if isinstance(jp, dict):
            # Current roles typically have no end date
            if not jp.get("end_date") and not jp.get("end_year"):
                return jp.get("title") or jp.get("name", ""), jp.get("company_name") or jp.get("org_name", "")
    # Fall back to first profile
    if profiles and isinstance(profiles[0], dict):
        return profiles[0].get("title", ""), profiles[0].get("company_name") or profiles[0].get("org_name", "")
    return "", ""


def _split_name(person: dict) -> tuple:
    """Split Loxo 'name' field into first_name / last_name.
    Loxo does not return separate first_name / last_name fields.
    """
    full = (person.get("name") or "").strip()
    if not full:
        return None, None
    parts = full.split(" ", 1)
    first = parts[0].capitalize() if parts[0] else None
    last = parts[1].title() if len(parts) > 1 else None
    return first, last


def upsert_candidate(
    person_data: dict,
    status_id: int,
    db,
    embedder,
    loxo_client=None,
    s3_bucket: Optional[str] = None,
) -> None:
    """Upsert a single candidate. Optionally downloads resume if available."""
    from app.db.orm_models import Candidate

    person_id = int(person_data["id"])
    first_name, last_name = _split_name(person_data)
    location = _derive_location(person_data)
    current_title, current_company = _infer_current_role(person_data)
    email = _extract_primary_email(person_data)
    phone = _extract_primary_phone(person_data)
    skills = _extract_skills(person_data)
    global_status = STATUS_NAMES.get(status_id) if status_id else None

    # Clean NUL bytes from text fields before inserting into PostgreSQL
    current_title = _clean(current_title)
    current_company = _clean(current_company)
    location = _clean(location)
    email = _clean(email)
    phone = _clean(phone)

    existing: Candidate = db.get(Candidate, person_id)
    resume_text = existing.resume_text if existing else None
    resume_s3_key = existing.resume_s3_key if existing else None

    # Download resume if we don't have it yet
    if loxo_client and not resume_text:
        resumes = person_data.get("resumes") or []
        if resumes and isinstance(resumes[0], dict):
            resume_id = resumes[0].get("id")
            if resume_id:
                from data_sync.loxo.resume_processor import process_resume
                resume_text, resume_s3_key = process_resume(
                    loxo_client, person_id, resume_id, bucket=s3_bucket
                )
                resume_text = _clean(resume_text)

    if existing:
        needs_embed = (
            existing.current_title != current_title
            or existing.resume_text != resume_text
            or existing.embedding is None
        )
        existing.first_name = first_name
        existing.last_name = last_name
        existing.email = email
        existing.phone = phone
        existing.city = person_data.get("city")
        existing.state = person_data.get("state")
        existing.country = person_data.get("country")
        existing.location = location
        existing.current_title = current_title
        existing.current_company = current_company
        existing.skills = skills
        existing.linkedin_url = person_data.get("linkedin_url")
        existing.global_status = global_status
        existing.global_status_id = status_id
        existing.resume_text = resume_text
        existing.resume_s3_key = resume_s3_key
        existing.job_profiles = person_data.get("job_profiles")
        existing.education_profiles = person_data.get("education_profiles")
        existing.raw_data = person_data
        existing.last_synced_at = datetime.now(timezone.utc)
        if needs_embed:
            existing.embedding = embedder.embed_candidate(existing)
    else:
        new_candidate = Candidate(
            id=person_id,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone,
            city=person_data.get("city"),
            state=person_data.get("state"),
            country=person_data.get("country"),
            location=location,
            current_title=current_title,
            current_company=current_company,
            skills=skills,
            linkedin_url=person_data.get("linkedin_url"),
            global_status=global_status,
            global_status_id=status_id,
            resume_text=resume_text,
            resume_s3_key=resume_s3_key,
            job_profiles=person_data.get("job_profiles"),
            education_profiles=person_data.get("education_profiles"),
            raw_data=person_data,
            last_synced_at=datetime.now(timezone.utc),
        )
        new_candidate.embedding = embedder.embed_candidate(new_candidate)
        db.add(new_candidate)

    db.commit()


# Statuses intentionally excluded from sync — recruiters have marked these as unusable
EXCLUDED_STATUS_IDS = {30205, 30206}  # do_not_contact, bad_data


def sync_all_candidates(
    loxo_client,
    db,
    embedder,
    fetch_full_profile: bool = True,
    download_resumes: bool = True,
    s3_bucket: Optional[str] = None,
) -> int:
    """
    Sync all people from Loxo regardless of global status.
    Skips only do_not_contact (30205) and bad_data (30206).
    Returns total candidates synced.
    """
    total = 0
    skipped = 0

    for summary in loxo_client.iter_people(status_id=None):
        person_id = summary["id"]
        # Read status from summary — skip excluded ones early to avoid a full-profile fetch
        summary_status = summary.get("person_global_status_id")
        if summary_status in EXCLUDED_STATUS_IDS:
            skipped += 1
            continue
        try:
            if fetch_full_profile:
                person_data = loxo_client.get_person(person_id)
            else:
                person_data = summary

            status_id = person_data.get("person_global_status_id")
            if status_id in EXCLUDED_STATUS_IDS:
                skipped += 1
                continue

            upsert_candidate(
                person_data=person_data,
                status_id=status_id,
                db=db,
                embedder=embedder,
                loxo_client=loxo_client if download_resumes else None,
                s3_bucket=s3_bucket,
            )
            total += 1
            if total % 100 == 0:
                logger.info("  %d candidates synced, %d skipped...", total, skipped)
        except Exception as e:
            logger.error("Failed to sync person %s: %s", person_id, e, exc_info=True)
            continue

    logger.info("Candidate sync complete: %d synced, %d skipped (do_not_contact/bad_data).", total, skipped)
    return total


def sync_candidates_by_status(
    loxo_client,
    db,
    embedder,
    status_ids: Optional[List[int]] = None,
    fetch_full_profile: bool = True,
    download_resumes: bool = True,
    s3_bucket: Optional[str] = None,
) -> int:
    """Deprecated: use sync_all_candidates() instead."""
    if status_ids is None:
        status_ids = DEFAULT_STATUS_IDS

    total = 0
    for status_id in status_ids:
        status_name = STATUS_NAMES.get(status_id, str(status_id))
        count = 0
        logger.info("Syncing candidates with status: %s (id=%d)...", status_name, status_id)
        for summary in loxo_client.iter_people(status_id):
            person_id = summary["id"]
            try:
                person_data = loxo_client.get_person(person_id) if fetch_full_profile else summary
                upsert_candidate(
                    person_data=person_data,
                    status_id=status_id,
                    db=db,
                    embedder=embedder,
                    loxo_client=loxo_client if download_resumes else None,
                    s3_bucket=s3_bucket,
                )
                count += 1
                if count % 50 == 0:
                    logger.info("  %s: %d candidates synced...", status_name, count)
            except Exception as e:
                logger.error("Failed to sync person %s: %s", person_id, e, exc_info=True)
                continue
        logger.info("Completed status %s: %d candidates.", status_name, count)
        total += count
    return total
