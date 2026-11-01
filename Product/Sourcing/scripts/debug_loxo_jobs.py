"""
Debug script: check Loxo job status IDs and counts.
Run via ECS: cd /app && PYTHONPATH=/app python scripts/debug_loxo_jobs.py
Run locally: cd Product/Sourcing && python scripts/debug_loxo_jobs.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

import httpx
from app.config import get_settings

s = get_settings()
auth = (s.LOXO_USERNAME, s.LOXO_PASSWORD)
base = f"{s.LOXO_BASE_URL}/{s.LOXO_AGENCY_SLUG}"

print("=== Loxo Jobs Debug ===\n")

# 1. Query first page with no filter — see what status IDs appear
r = httpx.get(f"{base}/jobs?per_page=20&page=1", auth=auth)
data = r.json()
print(f"Total jobs (all statuses): {data.get('total_count')}")
print(f"Total pages: {data.get('total_pages')}\n")

# Collect unique statuses from first page
statuses_seen = {}
for j in data.get("results", []):
    st = j["status"]
    statuses_seen[st["id"]] = st["name"]

# 2. Try known status IDs to see which has active jobs
print("Probing status IDs 6870–6880:")
for status_id in range(6870, 6885):
    r2 = httpx.get(f"{base}/jobs?per_page=1&job_status_id={status_id}", auth=auth)
    d2 = r2.json()
    count = d2.get("total_count", 0)
    if count > 0:
        name = d2["results"][0]["status"]["name"] if d2.get("results") else "?"
        print(f"  status_id={status_id} ({name}): {count} jobs ✓")
    else:
        print(f"  status_id={status_id}: 0 jobs")

# 3. Show most recent 5 jobs with their status
print("\nMost recent 5 jobs (last page):")
last_page = data.get("total_pages", 1)
r3 = httpx.get(f"{base}/jobs?per_page=5&page={last_page}", auth=auth)
for j in r3.json().get("results", []):
    print(f"  [{j['status']['id']} {j['status']['name']}] {j['title'][:50]} (updated {j['updated_at'][:10]})")
