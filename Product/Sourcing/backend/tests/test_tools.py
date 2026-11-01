"""
Tool-level tests — verify each chatbot tool returns expected data shapes.
These call the chat endpoint and inspect the reply for expected content,
so they exercise the full stack (DB + tool execution) without needing
direct DB access from the test runner.

Note: tests that call list_jobs or search_candidates do NOT require Groq quota
      (the tool itself is a DB query; only the final LLM summarisation uses tokens).
      We skip LLM-heavy tests if the daily quota is known to be exhausted.
"""
import pytest


# ---------------------------------------------------------------------------
# list_jobs
# ---------------------------------------------------------------------------

def _skip_if_rate_limited(reply: str):
    if "quota" in reply.lower() or "rate-limit" in reply.lower() or "midnight" in reply.lower():
        pytest.skip("Groq daily quota exhausted — skipping LLM-dependent test")


def test_list_jobs_returns_jobs(client, user_token):
    """Asking about active jobs should mention job titles or counts."""
    resp = client.post(
        "/api/chat",
        json={"message": "What active jobs do you know about?", "user_token": user_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    reply = data["reply"]
    _skip_if_rate_limited(reply)
    # Should not be the generic sorry message
    assert "I am sorry" not in reply
    # Should mention job-related content
    assert any(keyword in reply.lower() for keyword in ["job", "position", "opening", "active"])


# ---------------------------------------------------------------------------
# get_top_matches
# ---------------------------------------------------------------------------

def test_get_top_matches_known_job(client, user_token):
    """
    Ask for top matches on a job ID that should have pre-computed scores.
    First list jobs to get a valid ID, then ask for top matches.
    """
    # Get job list
    list_resp = client.post(
        "/api/chat",
        json={"message": "List all active jobs.", "user_token": user_token},
    )
    assert list_resp.status_code == 200
    # If we got a rate-limit reply, skip
    reply = list_resp.json()["reply"]
    if "quota" in reply.lower() or "rate-limit" in reply.lower():
        pytest.skip("Groq daily quota exhausted — skipping LLM-dependent test")

    # Get a real job ID directly from the API (more reliable than parsing LLM text)
    jobs_resp = client.get("/api/jobs")
    assert jobs_resp.status_code == 200
    jobs = jobs_resp.json()
    if not jobs:
        pytest.skip("No jobs in database")

    job_id = jobs[0]["id"]
    match_resp = client.post(
        "/api/chat",
        json={
            "message": f"Show me the top 3 candidate matches for job ID {job_id}.",
            "user_token": user_token,
        },
    )
    assert match_resp.status_code == 200
    match_reply = match_resp.json()["reply"]
    # Should mention candidates or scores, or clearly state no matches
    assert any(k in match_reply.lower() for k in ["match", "candidate", "score", "no pre-computed"])


# ---------------------------------------------------------------------------
# search_candidates
# ---------------------------------------------------------------------------

def test_search_candidates(client, user_token):
    resp = client.post(
        "/api/chat",
        json={
            "message": "Find me candidates with nursing or healthcare experience.",
            "user_token": user_token,
        },
    )
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    if "quota" in reply.lower() or "rate-limit" in reply.lower():
        pytest.skip("Groq daily quota exhausted")
    # Should mention candidates or note none found
    assert any(k in reply.lower() for k in ["candidate", "found", "no candidates", "not able to find"])


# ---------------------------------------------------------------------------
# Session persistence
# ---------------------------------------------------------------------------

def test_session_continuity(client, user_token):
    """Follow-up messages in the same session should work."""
    first = client.post(
        "/api/chat",
        json={"message": "List active jobs.", "user_token": user_token},
    )
    assert first.status_code == 200
    session_id = first.json()["session_id"]
    assert session_id

    second = client.post(
        "/api/chat",
        json={
            "message": "Thanks, that's helpful.",
            "user_token": user_token,
            "session_id": session_id,
        },
    )
    assert second.status_code == 200
    assert second.json()["session_id"] == session_id


def test_delete_session(client, user_token):
    """Creating and deleting a session should work cleanly."""
    create = client.post(
        "/api/chat",
        json={"message": "Hello", "user_token": user_token},
    )
    session_id = create.json()["session_id"]

    delete = client.delete(
        f"/api/chat/sessions/{session_id}",
        params={"user_token": user_token},
    )
    assert delete.status_code == 200

    # Verify it's gone
    messages = client.get(
        f"/api/chat/sessions/{session_id}/messages",
        params={"user_token": user_token},
    )
    assert messages.status_code == 404
