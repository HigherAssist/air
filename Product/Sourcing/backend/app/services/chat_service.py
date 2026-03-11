"""
Chat orchestration service.
Manages chat sessions, history, tool execution, and LLM calls.
"""
import asyncio
import json
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from groq import BadRequestError, RateLimitError

from app.config import get_settings
from app.db.orm_models import Candidate, ChatMessage, ChatSession, Job, Match
from app.services import groq_client, matcher
from app.services.prompts import CHAT_SYSTEM_PROMPT, CHAT_TOOLS

logger = logging.getLogger(__name__)

TIMEOUT_REPLY = "This request took too long to complete. Please try a simpler question or try again."
RATE_LIMIT_DAILY_REPLY = (
    "I've reached my daily AI quota and can't process new requests until midnight UTC. "
    "Please try again after midnight."
)
RATE_LIMIT_MINUTE_REPLY = "I'm temporarily rate-limited. Please wait a moment and try again."
BAD_REQUEST_REPLY = "I had trouble processing that request. Please try rephrasing your question."


# --------------------------------------------------------------------------- #
# Session management
# --------------------------------------------------------------------------- #

async def get_or_create_session(
    user_token: str,
    session_id: Optional[str],
    db: AsyncSession,
) -> ChatSession:
    """Return existing session or create a new one. Enforces MAX_CHAT_SESSIONS limit."""
    settings = get_settings()

    if session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == uuid.UUID(session_id),
                ChatSession.user_token == user_token,
            )
        )
        session = result.scalar_one_or_none()
        if session:
            return session

    # Create new session
    session = ChatSession(user_token=user_token)
    db.add(session)
    await db.flush()  # Get the ID before committing

    # Enforce max sessions limit — delete oldest if over limit
    count_result = await db.execute(
        select(func.count()).where(ChatSession.user_token == user_token)
    )
    count = count_result.scalar() or 0
    if count > settings.MAX_CHAT_SESSIONS:
        oldest = await db.execute(
            select(ChatSession)
            .where(ChatSession.user_token == user_token)
            .order_by(ChatSession.last_activity_at.asc())
            .limit(count - settings.MAX_CHAT_SESSIONS)
        )
        for old in oldest.scalars():
            await db.delete(old)

    return session


async def load_history(session: ChatSession, db: AsyncSession) -> List[Dict[str, str]]:
    """Load recent messages from this session for LLM context."""
    settings = get_settings()
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(settings.MAX_HISTORY_MESSAGES)
    )
    messages = result.scalars().all()
    # Return in chronological order for the LLM
    return [{"role": m.role, "content": m.content} for m in reversed(messages)]


async def save_messages(
    session: ChatSession,
    user_content: str,
    assistant_content: str,
    db: AsyncSession,
) -> None:
    """Persist user + assistant messages and update session title/timestamp."""
    db.add(ChatMessage(session_id=session.id, role="user", content=user_content))
    db.add(ChatMessage(session_id=session.id, role="assistant", content=assistant_content))

    # Auto-generate session title from first user message (truncated)
    if not session.title:
        session.title = user_content[:80] + ("…" if len(user_content) > 80 else "")


# --------------------------------------------------------------------------- #
# Tool execution
# --------------------------------------------------------------------------- #

async def _execute_tool(name: str, args: Dict[str, Any], db: AsyncSession) -> str:
    """Dispatch a tool call and return its result as a string."""
    try:
        if name == "list_jobs":
            result = await db.execute(select(Job).order_by(Job.title))
            jobs = result.scalars().all()
            if not jobs:
                return "No active jobs found in the database."
            # Get match counts per job in one query
            from sqlalchemy import func as sqlfunc
            count_result = await db.execute(
                select(Match.job_id, sqlfunc.count(Match.id)).group_by(Match.job_id)
            )
            match_counts = {row[0]: row[1] for row in count_result}
            lines = [f"Active jobs ({len(jobs)} total):"]
            for j in jobs:
                remote = " [Remote OK]" if j.remote_work_allowed else ""
                mc = match_counts.get(j.id, 0)
                match_info = f"{mc} pre-scored candidates" if mc else "no scores yet — use compute_match"
                lines.append(
                    f"  ID={j.id} | {j.title} | {j.company or 'N/A'} | "
                    f"{j.location or 'Location N/A'}{remote} | {match_info}"
                )
            return "\n".join(lines)

        elif name == "search_candidates":
            candidates = await matcher.vector_search_by_query(
                query=args["query"],
                db=db,
                location_filter=args.get("location_filter"),
                status_filter=args.get("status_filter"),
                limit=min(int(args.get("limit", 10)), 25),
            )
            if not candidates:
                return "No candidates found matching that description."
            lines = []
            for c in candidates:
                name_str = f"{c.first_name or ''} {c.last_name or ''}".strip()
                lines.append(
                    f"ID={c.id} | {name_str} | {c.current_title or 'N/A'} | "
                    f"{c.location or 'Unknown'} | Status: {c.global_status or 'N/A'}"
                )
            return "\n".join(lines)

        elif name == "get_job_detail":
            job = await db.get(Job, int(args["job_id"]))
            if not job:
                return f"Job {args['job_id']} not found in database."
            return (
                f"Job ID: {job.id}\n"
                f"Title: {job.title}\n"
                f"Company: {job.company or 'Not disclosed'}\n"
                f"Location: {job.location or 'Not specified'}\n"
                f"Remote: {'Yes' if job.remote_work_allowed else 'No'}\n"
                f"Pay: {job.pay_rate_min}–{job.pay_rate_max} ({job.salary_type or 'N/A'})\n"
                f"Description:\n{(job.description or 'None')[:2000]}\n"
                f"Internal Notes:\n{(job.internal_notes or 'None')[:500]}"
            )

        elif name == "get_candidate_detail":
            candidate = None
            if "candidate_id" in args and args["candidate_id"]:
                candidate = await db.get(Candidate, int(args["candidate_id"]))
            elif "name" in args and args["name"]:
                name_lower = args["name"].lower()
                result = await db.execute(select(Candidate))
                for c in result.scalars():
                    full = f"{c.first_name or ''} {c.last_name or ''}".lower()
                    if name_lower in full:
                        candidate = c
                        break

            if not candidate:
                return "Candidate not found in database."

            full_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip()
            history = []
            for jp in (candidate.job_profiles or [])[:5]:
                if isinstance(jp, dict):
                    role = jp.get("title") or jp.get("name", "")
                    org = jp.get("company_name") or jp.get("org_name", "")
                    start = jp.get("start_date") or jp.get("start_year", "")
                    end = jp.get("end_date") or jp.get("end_year", "current")
                    history.append(f"  - {role} at {org} ({start}–{end})")

            edu = []
            for e in (candidate.education_profiles or [])[:2]:
                if isinstance(e, dict):
                    edu.append(f"  - {e.get('degree', '')} from {e.get('school_name', e.get('school', ''))}")

            return (
                f"ID: {candidate.id}\n"
                f"Name: {full_name}\n"
                f"Title: {candidate.current_title or 'N/A'}\n"
                f"Company: {candidate.current_company or 'N/A'}\n"
                f"Location: {candidate.location or 'Unknown'}\n"
                f"Status: {candidate.global_status or 'N/A'}\n"
                f"Email: {candidate.email or 'N/A'}\n"
                f"Skills: {', '.join(candidate.skills or []) or 'None listed'}\n"
                f"Work History:\n" + ("\n".join(history) or "  None on file") + "\n"
                f"Education:\n" + ("\n".join(edu) or "  None on file") + "\n"
                f"Resume Extract:\n{(candidate.resume_text or 'No resume on file')[:1500]}"
            )

        elif name == "get_top_matches":
            job_id = int(args["job_id"])
            limit = min(int(args.get("limit", 5)), 20)
            result = await db.execute(
                select(Match, Candidate)
                .join(Candidate, Match.candidate_id == Candidate.id)
                .where(Match.job_id == job_id)
                .order_by(Match.score.desc())
                .limit(limit)
            )
            rows = result.all()
            if not rows:
                return f"No pre-computed matches found for job {job_id}. Try using compute_match for specific candidates."
            lines = [f"Top {len(rows)} matches for Job {job_id}:"]
            for m, c in rows:
                full_name = f"{c.first_name or ''} {c.last_name or ''}".strip()
                lines.append(
                    f"\n  #{m.score}/100 — {full_name} (ID={c.id})\n"
                    f"  Title: {c.current_title or 'N/A'} | Location: {c.location or 'Unknown'}\n"
                    f"  Reasoning: {m.reasoning or 'N/A'}"
                )
            return "\n".join(lines)

        elif name == "compute_match":
            job = await db.get(Job, int(args["job_id"]))
            candidate = await db.get(Candidate, int(args["candidate_id"]))
            if not job:
                return f"Job {args['job_id']} not found."
            if not candidate:
                return f"Candidate {args['candidate_id']} not found."
            try:
                match = await matcher.score_pair(job, candidate, db, store=True)
            except RateLimitError as e:
                if "per day" in str(e):
                    return (
                        "Daily AI quota reached — on-demand scoring is unavailable until midnight UTC. "
                        "Use get_top_matches to see pre-computed scores instead."
                    )
                return "AI scoring is temporarily rate-limited. Please try again in a moment."
            full_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip()
            return (
                f"Match computed:\n"
                f"  Candidate: {full_name} (ID={candidate.id})\n"
                f"  Job: {job.title} (ID={job.id})\n"
                f"  Score: {match.score}/100\n"
                f"  Reasoning: {match.reasoning}"
            )

        else:
            return f"Unknown tool: {name}"

    except asyncio.TimeoutError:
        raise
    except Exception as e:
        logger.error("Tool '%s' error: %s", name, e, exc_info=True)
        return f"Tool error: {str(e)}"


# --------------------------------------------------------------------------- #
# Main chat handler
# --------------------------------------------------------------------------- #

async def handle_chat(
    user_message: str,
    user_token: str,
    session_id: Optional[str],
    db: AsyncSession,
) -> Tuple[str, str]:
    """
    Process a chat message and return (reply_text, session_id_str).
    Implements tool-calling loop with configurable timeout.
    """
    settings = get_settings()

    try:
        async with asyncio.timeout(settings.CHAT_TIMEOUT_SECONDS):
            session = await get_or_create_session(user_token, session_id, db)
            history = await load_history(session, db)

            messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
            messages.extend(history)
            messages.append({"role": "user", "content": user_message})

            # Tool-calling loop (max 6 rounds to prevent infinite loops)
            for _ in range(6):
                response = await groq_client.chat_completion(
                    messages=messages,
                    tools=CHAT_TOOLS,
                    tool_choice="auto",
                )
                choice = response.choices[0]

                # If no tool call, we have the final answer
                if not choice.message.tool_calls:
                    reply = choice.message.content or TIMEOUT_REPLY
                    break

                # Execute all tool calls and append results
                messages.append({"role": "assistant", "content": None, "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in choice.message.tool_calls
                ]})

                for tc in choice.message.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}
                    tool_result = await _execute_tool(tc.function.name, args, db)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result,
                    })
            else:
                reply = TIMEOUT_REPLY

    except asyncio.TimeoutError:
        logger.warning("Chat request timed out for user %s", user_token)
        reply = TIMEOUT_REPLY
        try:
            session = await get_or_create_session(user_token, session_id, db)
        except Exception:
            return TIMEOUT_REPLY, session_id or ""
    except BadRequestError as e:
        # Malformed tool call (LLM embedded args in function name, or passed wrong type).
        # These 400s never succeed on retry — return a friendly rephrase prompt.
        logger.warning("Groq bad request (malformed tool call) for user %s: %s", user_token, e)
        reply = BAD_REQUEST_REPLY
        try:
            session = await get_or_create_session(user_token, session_id, db)
        except Exception:
            return reply, session_id or ""
    except RateLimitError as e:
        if "per day" in str(e):
            logger.warning("Groq daily token limit hit for user %s", user_token)
            reply = RATE_LIMIT_DAILY_REPLY
        else:
            logger.warning("Groq per-minute rate limit hit for user %s", user_token)
            reply = RATE_LIMIT_MINUTE_REPLY
        try:
            session = await get_or_create_session(user_token, session_id, db)
        except Exception:
            return reply, session_id or ""
    except Exception as e:
        logger.error("Chat handler error: %s", e, exc_info=True)
        reply = "Something went wrong on my end. Please try again."

    await save_messages(session, user_message, reply, db)
    await db.commit()

    return reply, str(session.id)
