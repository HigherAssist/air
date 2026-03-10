"""
End-to-end conversation flow tests.
These simulate realistic recruiter conversations and verify the chatbot
responds sensibly. All tests skip gracefully if Groq quota is exhausted.
"""
import pytest


def _skip_if_rate_limited(reply: str):
    if "quota" in reply.lower() or "rate-limit" in reply.lower() or "midnight" in reply.lower():
        pytest.skip("Groq daily quota exhausted — skipping e2e test")


def test_full_sourcing_workflow(client, user_token):
    """
    Simulate a recruiter:
    1. Asking what jobs are available
    2. Requesting top matches for a specific job
    3. Asking for more detail on a candidate
    """
    import re

    # Step 1: list jobs — get a job ID from the API directly (LLM may reformat output)
    jobs_resp = client.get("/api/jobs")
    assert jobs_resp.status_code == 200
    jobs = jobs_resp.json()
    if not jobs:
        pytest.skip("No jobs in database")
    job_id = jobs[0]["id"]

    r1 = client.post(
        "/api/chat",
        json={"message": "What active jobs do you have?", "user_token": user_token},
    )
    assert r1.status_code == 200
    reply1 = r1.json()["reply"]
    session_id = r1.json()["session_id"]
    _skip_if_rate_limited(reply1)
    assert any(k in reply1.lower() for k in ["job", "position", "active", "opening"]), \
        f"Expected job listing in reply, got: {reply1}"

    # Step 2: top matches for that job
    r2 = client.post(
        "/api/chat",
        json={
            "message": f"Give me the top 5 matches for job ID {job_id}.",
            "user_token": user_token,
            "session_id": session_id,
        },
    )
    assert r2.status_code == 200
    reply2 = r2.json()["reply"]
    _skip_if_rate_limited(reply2)
    assert any(k in reply2.lower() for k in ["match", "candidate", "score", "no pre-computed"])

    # Step 3: if candidates were listed, ask for detail on first one
    candidate_ids = re.findall(r"ID=(\d+)", reply2) or re.findall(r"\b(\d{6,})\b", reply2)
    if candidate_ids:
        r3 = client.post(
            "/api/chat",
            json={
                "message": f"Tell me more about candidate ID {candidate_ids[0]}.",
                "user_token": user_token,
                "session_id": session_id,
            },
        )
        assert r3.status_code == 200
        reply3 = r3.json()["reply"]
        _skip_if_rate_limited(reply3)
        assert any(k in reply3.lower() for k in ["candidate", "title", "location", "experience", "not found"])


def test_error_messages_are_user_friendly(client, user_token):
    """Verify the chatbot never returns raw stack traces or internal error strings."""
    resp = client.post(
        "/api/chat",
        json={"message": "What active jobs do you have?", "user_token": user_token},
    )
    reply = resp.json()["reply"]
    assert "Traceback" not in reply
    assert "Exception" not in reply
    assert "500" not in reply
    assert "sqlalchemy" not in reply.lower()


def test_ambiguous_question_gets_response(client, user_token):
    """Chatbot should handle vague questions gracefully, not crash."""
    resp = client.post(
        "/api/chat",
        json={"message": "Can you help me?", "user_token": user_token},
    )
    assert resp.status_code == 200
    assert len(resp.json()["reply"]) > 0


def test_rate_limit_reply_is_user_friendly(client, user_token, monkeypatch):
    """
    If Groq returns a rate limit error, the user should get a clear, friendly message.
    This test checks the current reply when quota IS exhausted — skip if not.
    """
    resp = client.post(
        "/api/chat",
        json={"message": "List active jobs.", "user_token": user_token},
    )
    reply = resp.json()["reply"]
    if "midnight" in reply.lower() or "quota" in reply.lower():
        # Good — verify it's friendly
        assert "I am sorry" not in reply
        assert "I've reached my daily" in reply or "rate-limited" in reply.lower()
    else:
        pytest.skip("Quota not exhausted — rate-limit message test not applicable")
