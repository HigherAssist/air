"""
Health and reachability tests.
These should always pass regardless of Groq quota or DB state.
"""


def test_health(client):
    # /health goes to the frontend container via ALB; /api/health goes to backend
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_chat_endpoint_reachable(client, user_token):
    """Chat endpoint should return 200 even if LLM is unavailable (error is in body)."""
    resp = client.post("/api/chat", json={"message": "hello", "user_token": user_token})
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert "session_id" in data


def test_sessions_endpoint(client, user_token):
    resp = client.get("/api/chat/sessions", params={"user_token": user_token})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_docs_available(client):
    """FastAPI /docs is served by the frontend container via ALB default rule."""
    resp = client.get("/docs")
    assert resp.status_code == 200  # frontend SPA returns 200
