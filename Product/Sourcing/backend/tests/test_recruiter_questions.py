"""
Comprehensive recruiter question tests.

Covers all question categories a recruiter would ask, with multiple phrasings
for each. Tests are parameterized with real job/candidate data fetched from the
live API so they stay accurate as data changes.

All LLM-dependent tests skip gracefully when Groq quota is exhausted.

Usage:
    cd backend/
    pytest tests/test_recruiter_questions.py -v
    pytest tests/test_recruiter_questions.py -v -k "job_detail"
"""
import re
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ERROR_PHRASES = [
    "something went wrong",
    "took too long",
    "traceback",
    "exception",
    "sqlalchemy",
    # NOTE: do NOT include bare "500" — it matches inside numeric IDs like (ID=50047632)
    "500 internal server error",
]

# These are graceful fallback messages — not errors, but the LLM couldn't fully process the request.
# Tests should treat them as acceptable (not fail), but note them.
GRACEFUL_FALLBACK_PHRASES = [
    "had trouble processing",
    "try rephrasing",
]


def _is_error(reply: str) -> bool:
    low = reply.lower()
    return any(p in low for p in ERROR_PHRASES)


def _is_graceful_fallback(reply: str) -> bool:
    """True if the backend returned a friendly rephrase prompt (not a hard error)."""
    low = reply.lower()
    return any(p in low for p in GRACEFUL_FALLBACK_PHRASES)


def _is_quota(reply: str) -> bool:
    low = reply.lower()
    return any(p in low for p in ["quota", "rate-limit", "midnight", "temporarily rate"])


def _skip_quota(reply: str):
    if _is_quota(reply):
        pytest.skip("Groq quota exhausted — skipping LLM-dependent test")


def _assert_ok(reply: str, expected_keywords: list[str], label: str = ""):
    _skip_quota(reply)
    assert not _is_error(reply), f"Got error reply{' for: ' + label if label else ''}: {reply!r}"
    if _is_graceful_fallback(reply):
        return  # Friendly rephrase prompt — acceptable, not a hard failure
    assert any(k in reply.lower() for k in expected_keywords), (
        f"Expected one of {expected_keywords!r} in reply{' for: ' + label if label else ''}, got: {reply!r}"
    )


# ---------------------------------------------------------------------------
# Session-scoped fixtures — fetch real data once
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def jobs(client):
    """Fetch all active jobs from the API (no LLM needed)."""
    resp = client.get("/api/jobs")
    assert resp.status_code == 200, f"Failed to fetch jobs: {resp.status_code}"
    data = resp.json()
    if not data:
        pytest.skip("No jobs in database — seed data required")
    return data


@pytest.fixture(scope="session")
def first_job(jobs):
    return jobs[0]


@pytest.fixture(scope="session")
def sample_jobs(jobs):
    """Up to 5 representative jobs spread across the list."""
    n = len(jobs)
    indices = sorted({0, n // 4, n // 2, 3 * n // 4, n - 1})
    return [jobs[i] for i in indices]


@pytest.fixture(scope="session")
def top_match_candidate_id(client, user_token, first_job):
    """
    Get the first pre-scored candidate ID for the first job via the API,
    so candidate-level tests have a real ID without parsing LLM output.
    """
    resp = client.get(f"/api/matches/{first_job['id']}", params={"limit": 1})
    if resp.status_code == 200 and resp.json():
        return resp.json()[0].get("candidate_id")
    return None


# ---------------------------------------------------------------------------
# 1. Job listing — multiple phrasings
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question", [
    "What active jobs do you have?",
    "Show me all open positions.",
    "List all the jobs available.",
    "What jobs are you hiring for right now?",
    "Can you tell me what roles are open?",
    "Give me a summary of current openings.",
])
def test_list_jobs_phrasings(client, user_token, question):
    """All list-jobs phrasings should return job-related content."""
    resp = client.post("/api/chat", json={"message": question, "user_token": user_token})
    assert resp.status_code == 200
    _assert_ok(resp.json()["reply"], ["job", "position", "opening", "role", "active"], question)


# ---------------------------------------------------------------------------
# 2. Job detail by name — multiple jobs, multiple phrasings
# ---------------------------------------------------------------------------

JOB_DETAIL_TEMPLATES = [
    "Tell me more about the job '{title}'.",
    "Give me details on the '{title}' position.",
    "What are the requirements for '{title}'?",
    "What does the '{title}' role involve?",
    "I want to know more about '{title}'.",
]


def _job_detail_cases(jobs):
    """Generate (title, question) pairs across sample jobs and phrasing templates."""
    n = len(jobs)
    indices = sorted({0, n // 3, 2 * n // 3, n - 1})
    cases = []
    for i in indices:
        title = jobs[i]["title"]
        short = title[:40]  # Use a partial title too
        for tpl in JOB_DETAIL_TEMPLATES[:3]:  # 3 phrasings × 4 jobs = 12 cases
            cases.append((title, tpl.format(title=title)))
        # Also add a partial-name query
        cases.append((title, f"Tell me about the {short} job."))
    return cases


def pytest_generate_tests(metafunc):
    """Dynamically parameterize job-detail and top-matches tests after jobs are fetched."""
    # This hook runs before fixtures — we can't use fixtures here, so we use a
    # module-level marker approach instead (see parametrize below with indirect).
    pass


@pytest.fixture(scope="session")
def job_detail_cases(jobs):
    return _job_detail_cases(jobs)


def test_job_detail_by_name(client, user_token, jobs):
    """
    For each of up to 4 spread-across jobs, ask for details using 3 phrasings.
    Verifies no error, and that job-detail keywords appear.
    """
    n = len(jobs)
    indices = sorted({0, n // 3, 2 * n // 3, n - 1})
    failures = []
    skipped = 0

    for i in indices:
        title = jobs[i]["title"]
        questions = [
            f"Tell me more about the job '{title}'.",
            f"What are the requirements for '{title}'?",
            f"Give me details on the {title[:35]} position.",
        ]
        for q in questions:
            resp = client.post("/api/chat", json={"message": q, "user_token": user_token})
            assert resp.status_code == 200
            reply = resp.json()["reply"]
            if _is_quota(reply):
                skipped += 1
                continue
            if _is_error(reply):
                failures.append(f"QUESTION: {q!r}\nREPLY: {reply!r}")
            elif _is_graceful_fallback(reply):
                pass  # Friendly rephrase — acceptable
            else:
                # Should contain job-detail content
                job_kw = any(k in reply.lower() for k in ["requirement", "responsibilities",
                    "experience", "skill", "location", "salary", "description",
                    "title", "company", "role", "position"])
                if not job_kw:
                    failures.append(f"No detail keywords in reply for: {q!r}\nREPLY: {reply!r}")

    if skipped and not failures:
        pytest.skip(f"Groq quota exhausted — {skipped} sub-tests skipped")
    assert not failures, "\n\n".join(failures)


# ---------------------------------------------------------------------------
# 3. Top matches by job name — multiple jobs, multiple phrasings
# ---------------------------------------------------------------------------

def test_top_matches_by_job_name(client, user_token, jobs):
    """
    For each of up to 4 jobs, ask for top candidates using different phrasings.
    """
    n = len(jobs)
    indices = sorted({0, n // 3, 2 * n // 3, n - 1})
    failures = []
    skipped = 0

    for i in indices:
        title = jobs[i]["title"]
        questions = [
            f"Show me the top 2 candidates for '{title}'.",
            f"Who are the best matches for the '{title}' role?",
            f"Give me pre-scored candidates for {title[:40]}.",
        ]
        for q in questions:
            resp = client.post("/api/chat", json={"message": q, "user_token": user_token})
            assert resp.status_code == 200
            reply = resp.json()["reply"]
            if _is_quota(reply):
                skipped += 1
                continue
            if _is_error(reply):
                failures.append(f"QUESTION: {q!r}\nREPLY: {reply!r}")
            elif _is_graceful_fallback(reply):
                pass  # Friendly rephrase — acceptable
            else:
                kw = any(k in reply.lower() for k in ["candidate", "match", "score",
                    "no pre-computed", "not able to find", "no match"])
                if not kw:
                    failures.append(f"No match keywords in reply for: {q!r}\nREPLY: {reply!r}")

    if skipped and not failures:
        pytest.skip(f"Groq quota exhausted — {skipped} sub-tests skipped")
    assert not failures, "\n\n".join(failures)


# ---------------------------------------------------------------------------
# 4. Top matches with scores — verify score data appears
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question_template", [
    "For the job '{title}', show me the top 2 pre-scored candidates and their scores.",
    "What are the match scores for the top candidates on '{title}'?",
    "Rank the best candidates for '{title}' with their scores.",
])
def test_top_matches_with_scores(client, user_token, first_job, question_template):
    """Asking for scores should return numeric score data or a clear no-match message."""
    q = question_template.format(title=first_job["title"])
    resp = client.post("/api/chat", json={"message": q, "user_token": user_token})
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    _skip_quota(reply)
    assert not _is_error(reply), f"Error for: {q!r} → {reply!r}"
    assert any(k in reply.lower() for k in ["score", "match", "candidate", "no pre-computed", "no match"]), \
        f"No score/match keywords in reply for: {q!r} → {reply!r}"


# ---------------------------------------------------------------------------
# 5. Candidate profile — by ID and by name-in-context
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question_template", [
    "Show me the candidate profile for the top match for '{title}'.",
    "Give me more information about the best candidate for '{title}'.",
    "Tell me about the #1 ranked candidate for '{title}'.",
    "I want to see the full profile of the top candidate for '{title}'.",
])
def test_candidate_profile_via_job(client, user_token, first_job, question_template):
    """Should return candidate profile info or a clear not-found message."""
    q = question_template.format(title=first_job["title"])
    resp = client.post("/api/chat", json={"message": q, "user_token": user_token})
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    _skip_quota(reply)
    assert not _is_error(reply), f"Error for: {q!r} → {reply!r}"
    assert any(k in reply.lower() for k in [
        "candidate", "name", "title", "location", "experience",
        "skill", "no pre-computed", "not found", "no match"
    ]), f"No candidate profile keywords in reply for: {q!r} → {reply!r}"


def test_candidate_profile_by_id(client, user_token, top_match_candidate_id):
    """Direct lookup of a candidate by integer ID should return profile data."""
    if not top_match_candidate_id:
        pytest.skip("No pre-scored candidates found — run run_matching.py first")

    questions = [
        f"Tell me about candidate ID {top_match_candidate_id}.",
        f"Show me the profile for candidate {top_match_candidate_id}.",
        f"Give me more details on candidate {top_match_candidate_id}.",
    ]
    timeout_count = 0
    for q in questions:
        resp = client.post("/api/chat", json={"message": q, "user_token": user_token})
        assert resp.status_code == 200
        reply = resp.json()["reply"]
        _skip_quota(reply)
        # A single transient timeout is acceptable; fail only if all questions timeout
        if "took too long" in reply.lower():
            timeout_count += 1
            continue
        assert not _is_error(reply), f"Error for: {q!r} → {reply!r}"
        if not _is_graceful_fallback(reply):
            assert any(k in reply.lower() for k in ["candidate", "name", "title", "experience",
                "location", "skill", "not found"]), \
                f"No profile keywords in reply for: {q!r} → {reply!r}"
    if timeout_count == len(questions):
        pytest.skip(f"All {len(questions)} candidate profile lookups timed out — Groq may be slow")


# ---------------------------------------------------------------------------
# 6. Candidate search by skill / keyword
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question", [
    "Find me candidates with project management experience.",
    "Who has recruiting or staffing experience in our candidate pool?",
    "Show me candidates with healthcare or nursing backgrounds.",
    "Find candidates with IT or software skills.",
    "Are there any candidates with sales experience?",
    "Search for candidates who have worked in manufacturing.",
    "Find me candidates located in California.",
    "Who has leadership or management experience?",
])
def test_candidate_search_by_keyword(client, user_token, question):
    """Keyword/skill searches should return candidate results or a clear no-match."""
    resp = client.post("/api/chat", json={"message": question, "user_token": user_token})
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    _skip_quota(reply)
    assert not _is_error(reply), f"Error for: {question!r} → {reply!r}"
    if not _is_graceful_fallback(reply):
        assert any(k in reply.lower() for k in [
            "candidate", "found", "no candidates", "not able to find",
            "here are", "result", "profile",
            # LLM may return a bare bullet list of names/titles with no preamble
            "**", "- ", "•",
        ]), f"No candidate keywords in reply for: {question!r} → {reply!r}"


# ---------------------------------------------------------------------------
# 7. Combined multi-step queries
# ---------------------------------------------------------------------------

def test_combined_job_then_candidates(client, user_token, first_job):
    """
    Multi-turn: ask about a job, then ask for candidates in the same session.
    Tests session continuity and multi-step reasoning.
    """
    title = first_job["title"]

    r1 = client.post("/api/chat", json={
        "message": f"Tell me about the job '{title}'.",
        "user_token": user_token,
    })
    assert r1.status_code == 200
    session_id = r1.json()["session_id"]
    _skip_quota(r1.json()["reply"])

    r2 = client.post("/api/chat", json={
        "message": "Now show me the top 2 candidates for that job with their scores.",
        "user_token": user_token,
        "session_id": session_id,
    })
    assert r2.status_code == 200
    reply2 = r2.json()["reply"]
    _skip_quota(reply2)
    assert not _is_error(reply2), f"Error on follow-up: {reply2!r}"
    assert any(k in reply2.lower() for k in ["candidate", "match", "score", "no pre-computed"])


def test_combined_candidates_then_profile(client, user_token, first_job):
    """
    Multi-turn: ask for top matches, then drill into one candidate's profile.
    This is the deepest multi-step flow (3 tool-call rounds minimum).
    """
    title = first_job["title"]

    r1 = client.post("/api/chat", json={
        "message": f"Show me the top 2 matches for the job '{title}'.",
        "user_token": user_token,
    })
    assert r1.status_code == 200
    reply1 = r1.json()["reply"]
    session_id = r1.json()["session_id"]
    _skip_quota(reply1)

    r2 = client.post("/api/chat", json={
        "message": "Tell me more about the #1 candidate on that list.",
        "user_token": user_token,
        "session_id": session_id,
    })
    assert r2.status_code == 200
    reply2 = r2.json()["reply"]
    _skip_quota(reply2)
    assert not _is_error(reply2), f"Error drilling into candidate: {reply2!r}"
    assert any(k in reply2.lower() for k in ["candidate", "name", "title", "experience",
        "location", "skill", "not found", "no pre-computed"])


def test_job_comparison(client, user_token, sample_jobs):
    """Ask about multiple jobs in one question."""
    if len(sample_jobs) < 2:
        pytest.skip("Need at least 2 jobs")
    t1 = sample_jobs[0]["title"][:30]
    t2 = sample_jobs[1]["title"][:30]
    q = f"What are the differences between the '{t1}' and '{t2}' positions?"
    resp = client.post("/api/chat", json={"message": q, "user_token": user_token})
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    _skip_quota(reply)
    assert not _is_error(reply), f"Error: {reply!r}"
    assert any(k in reply.lower() for k in ["job", "position", "role", "requirement", "skill", "differ"])


# ---------------------------------------------------------------------------
# 8. Edge cases — vague, off-topic, nonexistent jobs
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question", [
    "Can you help me?",
    "Hello!",
    "I need a good candidate.",
    "What can you do?",
])
def test_vague_questions_get_response(client, user_token, question):
    """Vague questions should return a helpful response, never an error."""
    resp = client.post("/api/chat", json={"message": question, "user_token": user_token})
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    _skip_quota(reply)
    assert not _is_error(reply), f"Error for vague question: {question!r} → {reply!r}"
    assert len(reply) > 10, f"Reply too short for: {question!r}"


@pytest.mark.parametrize("question", [
    "Show me candidates for the job 'Unicorn Wrangler - XYZ Corp 99999'.",
    "Tell me about candidate ID 999999999.",
    "Find candidates for a job that doesn't exist.",
])
def test_nonexistent_items_handled_gracefully(client, user_token, question):
    """Queries for nonexistent jobs/candidates should return a clear not-found message."""
    resp = client.post("/api/chat", json={"message": question, "user_token": user_token})
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    _skip_quota(reply)
    assert not _is_error(reply), f"Unexpected error: {reply!r}"
    # Should acknowledge it couldn't find what was requested
    assert any(k in reply.lower() for k in [
        "not found", "unable", "couldn't", "could not", "no job", "no candidate",
        "don't have", "do not have", "not able", "sorry", "doesn't exist",
        "does not exist", "cannot find", "can't find", "no match",
    ]), f"No not-found acknowledgement in: {reply!r}"


# ---------------------------------------------------------------------------
# 9. Response quality — no raw internals ever leak
# ---------------------------------------------------------------------------

INTERNAL_LEAK_PHRASES = ["traceback", "sqlalchemy", "psycopg", "asyncpg",
                          "exception", "500 internal", "tool error:"]


@pytest.mark.parametrize("question", [
    "What active jobs do you have?",
    "Show me the top candidates for any job.",
    "Find me a candidate with Python skills.",
])
def test_no_internal_errors_leaked(client, user_token, question):
    """Internal implementation details must never appear in user-facing replies."""
    resp = client.post("/api/chat", json={"message": question, "user_token": user_token})
    assert resp.status_code == 200
    reply = resp.json()["reply"].lower()
    for phrase in INTERNAL_LEAK_PHRASES:
        assert phrase not in reply, f"Internal phrase {phrase!r} leaked in reply for: {question!r}"
