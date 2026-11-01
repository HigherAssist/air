"""
Loxo ATS API client.

Authentication: HTTP Basic Auth (NOT Bearer despite API docs).
Pagination:
  - Jobs: page-based (?per_page=100&page=N)
  - People/Events/Candidates: cursor-based (scroll_id)

Usage:
    client = LoxoClient()
    jobs = client.get_all_active_jobs()
    person = client.get_person(243857370)
"""
import base64
import logging
import os
import time
from typing import Any, Dict, Iterator, List, Optional

import httpx

logger = logging.getLogger(__name__)


def _build_auth_header(username: str, password: str) -> str:
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"


class LoxoClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        agency_slug: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        request_sleep: float = 0.25,
        max_retries: int = 3,
    ):
        self.base_url = (base_url or os.getenv("LOXO_BASE_URL", "https://app.loxo.co/api")).rstrip("/")
        self.agency_slug = agency_slug or os.getenv("LOXO_AGENCY_SLUG", "artizen-staffing")
        username = username or os.getenv("LOXO_USERNAME", "")
        password = password or os.getenv("LOXO_PASSWORD", "")
        self.auth_header = _build_auth_header(username, password)
        self.request_sleep = float(os.getenv("LOXO_REQUEST_SLEEP", str(request_sleep)))
        self.max_retries = int(os.getenv("LOXO_MAX_RETRIES", str(max_retries)))
        self._client = httpx.Client(timeout=30.0)

    @property
    def _base(self) -> str:
        return f"{self.base_url}/{self.agency_slug}"

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": self.auth_header,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _get(self, path: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        url = f"{self._base}{path}"
        for attempt in range(self.max_retries):
            try:
                response = self._client.get(url, headers=self._headers(), params=params)
                if response.status_code == 429:
                    wait = 2 ** attempt + 2
                    logger.warning("Rate limited by Loxo. Sleeping %ds before retry.", wait)
                    time.sleep(wait)
                    continue
                response.raise_for_status()
                time.sleep(self.request_sleep)
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error("HTTP %d for %s: %s", e.response.status_code, url, e)
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise
            except httpx.RequestError as e:
                logger.error("Request error for %s: %s", url, e)
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise
        raise RuntimeError(f"Failed after {self.max_retries} retries: {url}")

    def _get_binary(self, path: str) -> bytes:
        url = f"{self._base}{path}"
        response = self._client.get(url, headers=self._headers())
        response.raise_for_status()
        return response.content

    # ---------------------------------------------------------------------- #
    # Jobs
    # ---------------------------------------------------------------------- #

    def get_all_active_jobs(self, status_id: int = 6875) -> List[Dict]:
        """
        Fetch all active jobs using page-based pagination.
        Returns list of full job dicts.
        """
        jobs = []
        page = 1
        per_page = 100
        while True:
            data = self._get("/jobs", params={
                "job_status_id": status_id,
                "per_page": per_page,
                "page": page,
            })
            batch = data.get("results", [])
            jobs.extend(batch)
            logger.info("Jobs page %d: got %d (total so far: %d)", page, len(batch), len(jobs))
            total = data.get("total_count", 0)
            if len(jobs) >= total or len(batch) < per_page:
                break
            page += 1
        return jobs

    def get_job(self, job_id: int) -> Dict:
        """Fetch full detail for a single job."""
        return self._get(f"/jobs/{job_id}")

    # ---------------------------------------------------------------------- #
    # People / Candidates
    # ---------------------------------------------------------------------- #

    def iter_people_by_status(self, status_id: int) -> Iterator[Dict]:
        """
        Iterate over all people with a given global status using scroll_id pagination.
        Yields individual person summary dicts.
        """
        scroll_id = None
        page = 0
        while True:
            params: Dict[str, Any] = {"person_global_status_id": status_id}
            if scroll_id:
                params["scroll_id"] = scroll_id
            data = self._get("/people", params=params)
            people = data.get("people", [])
            if not people:
                break
            for person in people:
                yield person
            scroll_id = data.get("scroll_id")
            page += 1
            logger.debug("People (status %d) page %d: %d records, scroll_id=%s", status_id, page, len(people), scroll_id)
            if not scroll_id:
                break

    def get_person(self, person_id: int) -> Dict:
        """Fetch full profile for a single person."""
        return self._get(f"/people/{person_id}")

    def get_resume_pdf(self, person_id: int, resume_id: int) -> bytes:
        """Download a resume PDF. Returns raw bytes."""
        return self._get_binary(f"/people/{person_id}/resumes/{resume_id}/download")

    # ---------------------------------------------------------------------- #
    # Candidates (per job)
    # ---------------------------------------------------------------------- #

    def iter_job_candidates(self, job_id: int) -> Iterator[Dict]:
        """
        Iterate over all candidates for a job using scroll_id pagination.
        """
        scroll_id = None
        while True:
            params: Dict[str, Any] = {}
            if scroll_id:
                params["scroll_id"] = scroll_id
            data = self._get(f"/jobs/{job_id}/candidates", params=params)
            candidates = data.get("candidates", [])
            if not candidates:
                break
            for c in candidates:
                yield c
            scroll_id = data.get("scroll_id")
            if not scroll_id:
                break

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
