"""
Sync recruiter activity from Loxo person_events into the local database.

Populates two tables:
  recruiters           — one row per Loxo user/recruiter
  recruiter_activities — one row per person_event (activity log entry)

Each activity records who did it (recruiter), what they did (activity_type),
on which candidate, and for which job.

Incremental mode: pass after_date to only sync events created on or after
that date.  Nightly cron passes yesterday; initial load passes 6 months ago.
"""
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Iterator, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _clean(value):
    """Strip NUL bytes — PostgreSQL rejects \\x00 in text columns."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    return value


def _derive_category(activity_type_name: str) -> str:
    """
    Extract the top-level category from an activity type name.
    Names use ' / ' (space-slash-space) as the hierarchy separator.
    e.g. 'Contacted / Sent Email' -> 'Contacted'
         'Offer / Accepted'       -> 'Offer'
         'General Note/Update'    -> 'General Note/Update'  (single / without spaces)
    """
    if not activity_type_name:
        return "Other"
    parts = activity_type_name.split(" / ", 1)
    return parts[0].strip()


# Loxo internal activity type IDs not returned by any /activity_types endpoint.
# Inferred from observed event patterns in live data.
_UNDOCUMENTED_TYPES: Dict[int, str] = {
    2000705: "Added to Pipeline",      # bulk add of candidates to a job pipeline
    2000706: "Task / Callback",        # scheduled follow-up or callback note
    2000740: "Loxo Internal Sourced",  # internal AI/bulk sourcing action (~half of sourcing volume)
    104828:  "Loxo AI Sourced",        # AI sourced (sometimes missing from workflow endpoint)
}


def _build_activity_type_map(activity_types: List[Dict]) -> Dict[int, Dict]:
    """Return {activity_type_id: {name, category}} lookup.
    Seeds from API response then fills in known undocumented types.
    """
    result = {}
    for at in activity_types:
        aid = at.get("id")
        name = at.get("name", "")
        result[aid] = {
            "name": name,
            "category": _derive_category(name),
        }
    # Fill in types the API doesn't return
    for aid, name in _UNDOCUMENTED_TYPES.items():
        if aid not in result:
            result[aid] = {
                "name": name,
                "category": _derive_category(name),
            }
    return result


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Parse ISO datetime string to timezone-aware datetime."""
    if not value:
        return None
    try:
        # Python 3.11+ handles Z suffix; for 3.9/3.10 replace Z with +00:00
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

def upsert_recruiter(user: Dict, db) -> None:
    """Insert or update a single recruiter row."""
    from app.db.orm_models import Recruiter

    uid = int(user["id"])
    existing = db.get(Recruiter, uid)
    if existing:
        existing.name = _clean(user.get("name", ""))
        existing.email = _clean(user.get("email"))
        existing.loxo_updated_at = _parse_dt(user.get("updated_at"))
    else:
        db.add(Recruiter(
            id=uid,
            name=_clean(user.get("name", "")),
            email=_clean(user.get("email")),
            loxo_updated_at=_parse_dt(user.get("updated_at")),
        ))


def upsert_activity(
    event: Dict,
    recruiter_map: Dict[int, str],
    type_map: Dict[int, Dict],
    db,
) -> None:
    """Insert or update a single recruiter_activities row."""
    from app.db.orm_models import RecruiterActivity

    event_id = int(event["id"])
    recruiter_id = event.get("created_by_id")
    recruiter_name = recruiter_map.get(recruiter_id, "Unknown") if recruiter_id else None

    type_id = event.get("activity_type_id")
    type_info = type_map.get(type_id, {}) if type_id else {}
    type_name = type_info.get("name", "")
    category = type_info.get("category", "Other")

    notes_raw = event.get("notes") or ""
    notes = _clean(_strip_html(notes_raw)) or None

    existing = db.get(RecruiterActivity, event_id)
    if existing:
        existing.recruiter_id = recruiter_id
        existing.recruiter_name = recruiter_name
        existing.activity_type_id = type_id
        existing.activity_type_name = type_name
        existing.activity_category = category
        existing.candidate_id = event.get("person_id")
        existing.job_id = event.get("job_id")
        existing.notes = notes
        existing.event_date = _parse_dt(event.get("created_at"))
        existing.synced_at = datetime.now(timezone.utc)
    else:
        db.add(RecruiterActivity(
            id=event_id,
            recruiter_id=recruiter_id,
            recruiter_name=recruiter_name,
            activity_type_id=type_id,
            activity_type_name=type_name,
            activity_category=category,
            candidate_id=event.get("person_id"),
            job_id=event.get("job_id"),
            notes=notes,
            event_date=_parse_dt(event.get("created_at")),
            synced_at=datetime.now(timezone.utc),
        ))


# ---------------------------------------------------------------------------
# Main sync functions
# ---------------------------------------------------------------------------

def sync_recruiters(loxo_client, db) -> int:
    """Sync all Loxo users into the recruiters table. Returns count."""
    users = loxo_client.get_users()
    logger.info("Syncing %d recruiters...", len(users))
    for user in users:
        upsert_recruiter(user, db)
    db.commit()
    logger.info("Recruiters sync complete: %d rows.", len(users))
    return len(users)


def sync_recruiter_activities(
    loxo_client,
    db,
    after_date: Optional[str] = None,
    commit_every: int = 200,
) -> int:
    """
    Sync person_events into recruiter_activities.

    after_date: ISO date string e.g. "2025-09-15". If None, syncs all history.
    commit_every: batch size between DB commits (keeps memory bounded).
    Returns count of events processed.
    """
    # Build lookups
    activity_types = loxo_client.get_activity_types()
    type_map = _build_activity_type_map(activity_types)
    logger.info("Loaded %d activity types.", len(type_map))

    # Build recruiter name lookup from DB (already synced)
    from app.db.orm_models import Recruiter
    from sqlalchemy import select
    recruiters = db.execute(select(Recruiter)).scalars().all()
    recruiter_map: Dict[int, str] = {r.id: r.name for r in recruiters}
    logger.info("Recruiter map: %d entries.", len(recruiter_map))

    # Paginate person_events
    logger.info("Syncing person_events%s...", f" after {after_date}" if after_date else " (all history)")
    count = 0
    batch = 0
    for event in loxo_client.iter_person_events(after=after_date):
        try:
            upsert_activity(event, recruiter_map, type_map, db)
            count += 1
            batch += 1
            if batch >= commit_every:
                db.commit()
                logger.info("  %d events synced...", count)
                batch = 0
        except Exception as e:
            logger.error("Failed to upsert event %s: %s", event.get("id"), e, exc_info=True)
            db.rollback()
            batch = 0

    if batch > 0:
        db.commit()

    logger.info("Recruiter activity sync complete: %d events.", count)
    return count
