"""
Test configuration and shared fixtures.

Tests run against the deployed dev backend by default.
Set TEST_BASE_URL env var to point at a local server for local testing.

Usage:
    cd backend/
    pip install -r requirements-dev.txt
    pytest                          # runs against deployed dev
    TEST_BASE_URL=http://localhost:8000 pytest   # runs against local
"""
import os
import pytest
import httpx

# Default to deployed dev backend; override with TEST_BASE_URL env var
BASE_URL = os.getenv("TEST_BASE_URL", "https://sourcing.dev.hireassist.net")

# A stable test user token (AIR dbUser.id for a real dev account, or "test-user" for basic tests)
TEST_USER_TOKEN = os.getenv("TEST_USER_TOKEN", "test-user-pytest")


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def user_token() -> str:
    return TEST_USER_TOKEN


@pytest.fixture(scope="session")
def client(base_url: str) -> httpx.Client:
    """Synchronous httpx client scoped to the full test session."""
    with httpx.Client(base_url=base_url, timeout=40.0) as c:
        yield c


@pytest.fixture(scope="session")
async def async_client(base_url: str) -> httpx.AsyncClient:
    """Async httpx client for async tests."""
    async with httpx.AsyncClient(base_url=base_url, timeout=40.0) as c:
        yield c
