"""
Chat orchestration service.
Manages chat sessions, history, tool execution, and LLM calls.
"""
import asyncio
import json
import logging
import re
import time
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

TIMEOUT_REPLY = "This request took too long to complete (server timeout). Please try again."
LOOP_LIMIT_REPLY = "I was unable to complete this request — too many steps were needed. Please try rephrasing or breaking it into a simpler question."
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
    # Return in chronological order for the LLM.
    # Truncation strategy:
    #   - Most recent 2 messages (the immediately preceding exchange): never truncated.
    #     Follow-up questions almost always refer to this exchange, so it must be complete.
    #   - Older messages: capped to keep total token budget manageable.
    MAX_USER_MSG_CHARS = 400
    MAX_ASSISTANT_MSG_CHARS = 1500
    chronological = list(reversed(messages))  # oldest → newest
    total = len(chronological)
    def _trim(role: str, content: str, is_recent: bool) -> str:
        if is_recent:
            return content  # never truncate the most recent exchange
        limit = MAX_ASSISTANT_MSG_CHARS if role == "assistant" else MAX_USER_MSG_CHARS
        if len(content) > limit:
            return content[:limit] + "\n[... truncated ...]"
        return content
    return [
        {"role": m.role, "content": _trim(m.role, m.content, i >= total - 2)}
        for i, m in enumerate(chronological)
    ]


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
    t0 = time.monotonic()
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
                match_info = f"{mc} pre-scored candidates" if mc else "no scores yet"
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
                return f"No pre-computed scores available for job {job_id}. Scores are updated nightly."
            lines = [f"Top {len(rows)} matches for Job {job_id}:"]
            for m, c in rows:
                full_name = f"{c.first_name or ''} {c.last_name or ''}".strip()
                lines.append(
                    f"\n  #{m.score}/100 — {full_name} (ID={c.id})\n"
                    f"  Title: {c.current_title or 'N/A'} | Location: {c.location or 'Unknown'}\n"
                    f"  Reasoning: {m.reasoning or 'N/A'}"
                )
            return "\n".join(lines)

        else:
            result = f"Unknown tool: {name}"
            logger.warning("TOOL unknown: %s", name)
            return result

    except asyncio.TimeoutError:
        raise
    except Exception as e:
        logger.error("TOOL ERROR [%s] args=%s — %s", name, args, e, exc_info=True)
        return f"Tool error: {str(e)}"
    finally:
        elapsed = time.monotonic() - t0
        logger.info("TOOL [%s] args=%s — %.2fs", name, args, elapsed)


# --------------------------------------------------------------------------- #
# XML tool-call recovery
# --------------------------------------------------------------------------- #

async def _recover_from_xml_tool_call(
    error: "BadRequestError",
    messages: List[Dict],
    request_id: str,
    user_token: str,
    db: "AsyncSession",
) -> str:
    """
    Groq rejected the generation as malformed XML, e.g.:
        <function=get_job_detail {"job_id": 3502984}</function>

    The Groq error body includes `failed_generation` with the intended call.
    Parse it, execute the tool, then ask the LLM to format the result as text.
    """
    try:
        body = error.response.json() if hasattr(error, "response") else {}
        err_detail = body.get("error", {})
        failed_gen = err_detail.get("failed_generation", "")
    except Exception:
        failed_gen = str(error)

    # Parse: <function=NAME {JSON}> or <function=NAME(JSON)>
    m = re.search(r"<function=(\w+)\s*(\{.*?\})", failed_gen, re.DOTALL)
    if not m:
        logger.warning("CHAT XML RECOVERY FAILED [%s] — cannot parse: %r", request_id, failed_gen[:200])
        return BAD_REQUEST_REPLY

    tool_name = m.group(1)
    try:
        tool_args = json.loads(m.group(2))
    except json.JSONDecodeError:
        logger.warning("CHAT XML RECOVERY FAILED [%s] — bad JSON in: %r", request_id, failed_gen[:200])
        return BAD_REQUEST_REPLY

    logger.info(
        "CHAT XML RECOVERY [%s] user=%s — executing %s(%s) directly",
        request_id, user_token[:8], tool_name, tool_args,
    )
    tool_result = await _execute_tool(tool_name, tool_args, db)

    # Build a synthetic messages list: system + user + fake tool exchange + ask for text answer
    fake_call_id = "xml-recovery-0"
    recovery_messages = list(messages) + [
        {"role": "assistant", "content": None, "tool_calls": [{
            "id": fake_call_id, "type": "function",
            "function": {"name": tool_name, "arguments": json.dumps(tool_args)},
        }]},
        {"role": "tool", "tool_call_id": fake_call_id, "content": tool_result},
    ]

    force_resp = await groq_client.chat_completion(
        messages=recovery_messages,
        tools=CHAT_TOOLS,
        tool_choice="none",
    )
    reply = force_resp.choices[0].message.content or LOOP_LIMIT_REPLY
    logger.info("CHAT XML RECOVERY SUCCESS [%s] reply=%r", request_id, reply[:80])
    return reply


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
    request_id = uuid.uuid4().hex[:8]
    t_start = time.monotonic()
    logger.info(
        "CHAT START [%s] user=%s session=%s msg=%r",
        request_id, user_token[:8], session_id or "new", user_message[:120],
    )

    async def _run_tool_loop(messages: List[Dict]) -> str:
        """Run the tool-calling loop for the given message list. Returns reply text."""
        rounds = 0
        last_tool_signatures: list = []
        for _ in range(10):
            round_t = time.monotonic()
            response = await groq_client.chat_completion(
                messages=messages,
                tools=CHAT_TOOLS,
                tool_choice="auto",
            )
            choice = response.choices[0]
            usage = getattr(response, "usage", None)
            usage_str = (
                f"in={usage.prompt_tokens} out={usage.completion_tokens}"
                if usage else "usage=N/A"
            )
            if usage and usage.prompt_tokens > settings.CHAT_TOKEN_ALERT_THRESHOLD:
                logger.warning(
                    "CHAT TOKEN ALERT [%s] user=%s — input tokens %d exceeds threshold %d",
                    request_id, user_token[:8], usage.prompt_tokens, settings.CHAT_TOKEN_ALERT_THRESHOLD,
                )
            rounds += 1

            if not choice.message.tool_calls:
                r = choice.message.content or TIMEOUT_REPLY
                logger.info(
                    "CHAT ROUND %d [%s] — text reply, %.2fs, %s",
                    rounds, request_id, time.monotonic() - round_t, usage_str,
                )
                return r

            tool_names = [tc.function.name for tc in choice.message.tool_calls]
            tool_signatures = [(tc.function.name, tc.function.arguments) for tc in choice.message.tool_calls]
            logger.info(
                "CHAT ROUND %d [%s] — tools=%s, %.2fs, %s",
                rounds, request_id, tool_names, time.monotonic() - round_t, usage_str,
            )

            if tool_signatures == last_tool_signatures:
                logger.warning(
                    "CHAT DUPLICATE TOOL CALL [%s] user=%s — same tools %s called twice — forcing text answer",
                    request_id, user_token[:8], tool_names,
                )
                # Tool results are already in messages — force LLM to write a text answer
                force_response = await groq_client.chat_completion(
                    messages=messages,
                    tools=CHAT_TOOLS,
                    tool_choice="none",
                )
                return force_response.choices[0].message.content or LOOP_LIMIT_REPLY
            last_tool_signatures = tool_signatures

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
                preview = tool_result[:300].replace("\n", " ")
                logger.info("TOOL RESULT [%s] %s → %r", request_id, tc.function.name, preview)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": tool_result,
                })
        else:
            logger.warning(
                "CHAT LOOP LIMIT [%s] user=%s — %d rounds in %.2fs",
                request_id, user_token[:8], rounds, time.monotonic() - t_start,
            )
            return LOOP_LIMIT_REPLY

    try:
        async with asyncio.timeout(settings.CHAT_TIMEOUT_SECONDS):
            session = await get_or_create_session(user_token, session_id, db)
            history = await load_history(session, db)

            messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
            messages.extend(history)
            messages.append({"role": "user", "content": user_message})

            try:
                reply = await _run_tool_loop(messages)
            except BadRequestError as e:
                # Groq returned a malformed tool-call generation (often caused by long context).
                # Retry once with history stripped — just system prompt + current message.
                logger.warning(
                    "CHAT BAD REQUEST [%s] user=%s — retrying with no history. Error: %s",
                    request_id, user_token[:8], e,
                )
                messages_no_history = [
                    {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ]
                try:
                    reply = await _run_tool_loop(messages_no_history)
                    logger.info("CHAT RETRY SUCCESS [%s]", request_id)
                except BadRequestError as e2:
                    # Both attempts generated XML format. Try to salvage by parsing the
                    # failed_generation field and executing the tool call directly.
                    reply = await _recover_from_xml_tool_call(
                        e2, messages_no_history, request_id, user_token, db
                    )

    except asyncio.TimeoutError:
        elapsed = time.monotonic() - t_start
        logger.warning(
            "CHAT TIMEOUT [%s] user=%s — %.2fs elapsed",
            request_id, user_token[:8], elapsed,
        )
        reply = TIMEOUT_REPLY
        try:
            session = await get_or_create_session(user_token, session_id, db)
        except Exception:
            return TIMEOUT_REPLY, session_id or ""
    except BadRequestError as e:
        logger.warning(
            "CHAT BAD REQUEST (outer) [%s] user=%s — %s",
            request_id, user_token[:8], e,
        )
        reply = BAD_REQUEST_REPLY
        try:
            session = await get_or_create_session(user_token, session_id, db)
        except Exception:
            return reply, session_id or ""
    except RateLimitError as e:
        if "per day" in str(e):
            logger.warning("CHAT RATE LIMIT DAILY [%s] user=%s", request_id, user_token[:8])
            reply = RATE_LIMIT_DAILY_REPLY
        else:
            logger.warning("CHAT RATE LIMIT MINUTE [%s] user=%s", request_id, user_token[:8])
            reply = RATE_LIMIT_MINUTE_REPLY
        try:
            session = await get_or_create_session(user_token, session_id, db)
        except Exception:
            return reply, session_id or ""
    except Exception as e:
        logger.error("CHAT ERROR [%s] user=%s — %s", request_id, user_token[:8], e, exc_info=True)
        reply = "Something went wrong on my end. Please try again."

    await save_messages(session, user_message, reply, db)
    await db.commit()

    total = time.monotonic() - t_start
    logger.info(
        "CHAT DONE [%s] %.2fs total — reply=%r",
        request_id, total, reply[:120],
    )
    return reply, str(session.id)
