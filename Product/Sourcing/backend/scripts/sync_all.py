#!/usr/bin/env python3
"""
Full Loxo data sync: jobs+candidates → match scores → recruiter activity.

Triggered nightly by EventBridge Scheduler (default: cron(0 0 * * ? *) = 00:00 UTC).
To change the schedule:
    aws scheduler update-schedule --profile admin --region us-east-2 \
        --name sourcing-nightly-matching \
        --schedule-expression "cron(0 6 * * ? *)" \   # e.g. 06:00 UTC
        --flexible-time-window '{"Mode":"OFF"}' \
        --target "$(aws scheduler get-schedule --name sourcing-nightly-matching \
                     --query Target --output json)"

Env vars (all optional):
    SYNC_LOOKBACK_DAYS   Days to look back for recruiter activity (default: 2)
    REPORT_EMAIL         Recipient for the summary email (default: operations@hireassist.net)
    SES_FROM_EMAIL       SES verified sender address (default: operations@hireassist.net)
    AWS_REGION           AWS region for SES (default: us-east-2)
    S3_BUCKET            S3 bucket for status JSON (default: artizen-sourcing-resumes-dev)

Status file written to: s3://<S3_BUCKET>/sync-status/latest.json
"""
import json
import logging
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("sync_all")

# ── Config ────────────────────────────────────────────────────────────────────
LOOKBACK_DAYS  = int(os.environ.get("SYNC_LOOKBACK_DAYS", "2"))
REPORT_EMAIL   = os.environ.get("REPORT_EMAIL",   "operations@hireassist.net")
SES_FROM_EMAIL = os.environ.get("SES_FROM_EMAIL", "operations@hireassist.net")
AWS_REGION     = os.environ.get("AWS_REGION",     "us-east-2")
S3_BUCKET      = os.environ.get("S3_BUCKET",      "artizen-sourcing-resumes-dev")
S3_STATUS_KEY  = "sync-status/latest.json"


# ── Helpers ───────────────────────────────────────────────────────────────────

def run_script(script: str, extra_args: list[str] = ()) -> dict:
    """Run a script/app/scripts/<script> and capture output + timing."""
    cmd = ["python", f"scripts/{script}"] + list(extra_args)
    logger.info("▶ Running: %s", " ".join(cmd))
    start = datetime.now(timezone.utc)
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd="/app",
        env={**os.environ, "PYTHONPATH": "/app"},
    )
    duration = (datetime.now(timezone.utc) - start).total_seconds()
    combined = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    return {
        "success": result.returncode == 0,
        "returncode": result.returncode,
        "duration_s": round(duration, 1),
        "output": combined[-4000:] if len(combined) > 4000 else combined,
    }


def extract_counts(output: str, component: str) -> dict:
    counts = {}
    if component == "jobs_candidates":
        m = re.search(r"Jobs synced:\s*(\d+)", output)
        if m:
            counts["jobs_synced"] = int(m.group(1))
        m = re.search(r"Candidates synced:\s*(\d+)", output)
        if m:
            counts["candidates_synced"] = int(m.group(1))
    elif component == "match_scores":
        m = re.search(r"Matching complete:\s*(\d+) scores computed,\s*(\d+) skipped", output)
        if m:
            counts["scores_computed"] = int(m.group(1))
            counts["scores_skipped"]  = int(m.group(2))
    elif component == "recruiter_activity":
        m = re.search(r"Sync complete — (\d+) recruiters,\s*(\d+) activity events", output)
        if m:
            counts["recruiters_synced"] = int(m.group(1))
            counts["events_synced"]     = int(m.group(2))
    return counts


def write_s3_status(payload: dict) -> None:
    try:
        s3 = boto3.client("s3", region_name=AWS_REGION)
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=S3_STATUS_KEY,
            Body=json.dumps(payload, indent=2),
            ContentType="application/json",
        )
        logger.info("Status written to s3://%s/%s", S3_BUCKET, S3_STATUS_KEY)
    except Exception as exc:
        logger.error("Failed to write S3 status: %s", exc)


def send_email(payload: dict) -> None:
    all_ok   = payload["all_ok"]
    run_at   = payload["run_at"]
    icon     = "✅" if all_ok else "❌"
    status   = "OK" if all_ok else "FAILED"
    subject  = f"{icon} Loxo Sync {status} — {run_at[:16].replace('T', ' ')} UTC"

    rows = ""
    for key, info in payload["components"].items():
        label    = {"jobs_candidates": "Jobs & Candidates",
                    "match_scores":    "Match Scores",
                    "recruiter_activity": "Recruiter Activity"}.get(key, key)
        ok       = info["success"]
        cell_bg  = "#d4edda" if ok else "#f8d7da"
        result   = "✅ OK" if ok else f"❌ FAILED (exit {info['returncode']})"
        dur      = f"{info['duration_s']:.0f}s"
        counts   = ", ".join(f"{v:,} {k.replace('_', ' ')}"
                             for k, v in info.items()
                             if k not in {"success", "returncode", "duration_s", "output"})
        err_html = ""
        if not ok:
            tail = (info.get("output") or "")[-1500:]
            tail_escaped = tail.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            err_html = f"<tr><td colspan='4' style='background:#fff3cd;font-family:monospace;font-size:11px;padding:8px;white-space:pre-wrap'>{tail_escaped}</td></tr>"
        rows += f"""
        <tr style='background:{cell_bg}'>
          <td style='padding:8px 12px;font-weight:bold'>{label}</td>
          <td style='padding:8px 12px'>{result}</td>
          <td style='padding:8px 12px'>{dur}</td>
          <td style='padding:8px 12px'>{counts or "—"}</td>
        </tr>{err_html}"""

    body_html = f"""
    <html><body style='font-family:Arial,sans-serif;color:#333;max-width:700px'>
      <h2 style='color:{"#155724" if all_ok else "#721c24"}'>{icon} Loxo Nightly Sync Report</h2>
      <p><strong>Run time:</strong> {run_at[:19].replace("T", " ")} UTC</p>
      <table border='1' cellspacing='0' cellpadding='0'
             style='border-collapse:collapse;width:100%;border-color:#dee2e6'>
        <thead>
          <tr style='background:#f8f9fa'>
            <th style='padding:8px 12px;text-align:left'>Component</th>
            <th style='padding:8px 12px;text-align:left'>Result</th>
            <th style='padding:8px 12px;text-align:left'>Duration</th>
            <th style='padding:8px 12px;text-align:left'>Counts</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <p style='font-size:12px;color:#666;margin-top:20px'>
        Status file: s3://{S3_BUCKET}/{S3_STATUS_KEY}
      </p>
    </body></html>
    """

    try:
        ses = boto3.client("ses", region_name=AWS_REGION)
        ses.send_email(
            Source=SES_FROM_EMAIL,
            Destination={"ToAddresses": [REPORT_EMAIL]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body":    {"Html": {"Data": body_html, "Charset": "UTF-8"}},
            },
        )
        logger.info("Email sent → %s  subject: %s", REPORT_EMAIL, subject)
    except Exception as exc:
        logger.error("Failed to send email: %s", exc)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    run_start = datetime.now(timezone.utc)
    since_date = (run_start - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    logger.info("=" * 60)
    logger.info("Loxo full sync starting at %s UTC", run_start.strftime("%Y-%m-%d %H:%M:%S"))
    logger.info("Recruiter activity lookback: %d days (since %s)", LOOKBACK_DAYS, since_date)
    logger.info("=" * 60)

    components = {}

    # ── 1. Jobs + Candidates ──────────────────────────────────────────────────
    result = run_script("sync_main.py")
    components["jobs_candidates"] = {**result, **extract_counts(result["output"], "jobs_candidates")}
    logger.info("jobs_candidates: %s (%.0fs)", "OK" if result["success"] else "FAILED", result["duration_s"])

    # ── 2. Match Scores ───────────────────────────────────────────────────────
    result = run_script("run_matching.py")
    components["match_scores"] = {**result, **extract_counts(result["output"], "match_scores")}
    logger.info("match_scores: %s (%.0fs)", "OK" if result["success"] else "FAILED", result["duration_s"])

    # ── 3. Recruiter Activity ─────────────────────────────────────────────────
    result = run_script("sync_recruiter_activity.py", ["--since", since_date])
    components["recruiter_activity"] = {**result, **extract_counts(result["output"], "recruiter_activity")}
    logger.info("recruiter_activity: %s (%.0fs)", "OK" if result["success"] else "FAILED", result["duration_s"])

    # ── Summary ───────────────────────────────────────────────────────────────
    all_ok = all(c["success"] for c in components.values())
    payload = {
        "run_at":     run_start.isoformat(),
        "all_ok":     all_ok,
        "components": components,
    }

    logger.info("=" * 60)
    logger.info("Sync complete — all_ok=%s", all_ok)
    for name, info in components.items():
        logger.info("  %-22s %s  (%.0fs)", name, "OK" if info["success"] else "FAILED", info["duration_s"])
    logger.info("=" * 60)

    write_s3_status(payload)
    send_email(payload)

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
