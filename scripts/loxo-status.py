#!/opt/anaconda3/bin/python
"""
Loxo data sync status checker.

Reads the status JSON written by sync_all.py from S3 (fast, primary source).
Falls back to scanning CloudWatch Logs when the S3 file doesn't exist yet.

Usage:
    ./scripts/loxo-status.py
    ./scripts/loxo-status.py --profile admin --stale-hours 25
    ./scripts/loxo-status.py --full          # also show last log tail per component
"""
import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    sys.exit("boto3 not found — run: conda activate base && pip install boto3")

# ── Config ────────────────────────────────────────────────────────────────────
S3_BUCKET      = "artizen-sourcing-resumes-dev"
S3_STATUS_KEY  = "sync-status/latest.json"
CW_LOG_GROUP   = "/ecs/sourcing-backend"
AWS_REGION     = "us-east-2"
STALE_DEFAULT  = 25  # hours

# Log signatures used to detect each component in CloudWatch
CW_SIGNATURES = {
    "jobs_candidates":   "=== Sync complete in",
    "match_scores":      "Matching complete:",
    "recruiter_activity": "Sync complete —",
}

LABELS = {
    "jobs_candidates":    "Jobs & Candidates",
    "match_scores":       "Match Scores",
    "recruiter_activity": "Recruiter Activity",
}


# ── Formatting helpers ────────────────────────────────────────────────────────

def _hr(char="─", width=68):
    print(char * width)

def _ago(dt: datetime) -> str:
    delta = datetime.now(timezone.utc) - dt
    h = int(delta.total_seconds() // 3600)
    m = int((delta.total_seconds() % 3600) // 60)
    if h >= 48:
        return f"{h // 24}d ago"
    if h >= 1:
        return f"{h}h {m}m ago"
    return f"{m}m ago"

def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M UTC")

def _stale_warning(last_run: datetime | None, stale_hours: int) -> str:
    if last_run is None:
        return "  ⚠  No run recorded"
    age_h = (datetime.now(timezone.utc) - last_run).total_seconds() / 3600
    if age_h > stale_hours:
        return f"  ⚠  STALE — last run was {_ago(last_run)} (threshold: {stale_hours}h)"
    return ""


# ── S3 status source ──────────────────────────────────────────────────────────

def load_s3_status(s3_client) -> dict | None:
    try:
        obj = s3_client.get_object(Bucket=S3_BUCKET, Key=S3_STATUS_KEY)
        return json.loads(obj["Body"].read())
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None
        raise


def print_from_s3(status: dict, stale_hours: int, show_full: bool):
    run_at = datetime.fromisoformat(status["run_at"])
    all_ok = status["all_ok"]
    icon   = "✅" if all_ok else "❌"

    print(f"\n{'='*68}")
    print(f"  LOXO DATA SYNC STATUS  (source: S3)  |  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*68}")
    print(f"  Last full sync:  {_fmt_dt(run_at)}  ({_ago(run_at)})  {icon}")
    _hr()

    warnings = []
    for key, info in status["components"].items():
        label     = LABELS.get(key, key)
        ok        = info["success"]
        status_str = "✅ OK" if ok else "❌ FAILED"
        dur       = f"{info['duration_s']:.0f}s"
        counts    = "  |  ".join(
            f"{v:,} {k.replace('_', ' ')}"
            for k, v in info.items()
            if k not in {"success", "returncode", "duration_s", "output"}
            and isinstance(v, (int, float))
        )
        print(f"  {label:<24}  {status_str:<12}  {dur:>6}  {counts}")

        if not ok:
            warnings.append((label, info.get("output", "")))
        w = _stale_warning(run_at, stale_hours)
        if w:
            warnings.append((label, w))

        if show_full and info.get("output"):
            print(f"\n    ── last output ({key}) ──")
            for line in info["output"].splitlines()[-15:]:
                print(f"    {line}")
            print()

    _hr()
    if warnings:
        for label, msg in warnings:
            if msg.strip().startswith("⚠"):
                print(f"  {msg.strip()}")
            else:
                print(f"\n  ⚠  {label} error output (last 10 lines):")
                for line in msg.splitlines()[-10:]:
                    print(f"     {line}")
    else:
        overall_stale = _stale_warning(run_at, stale_hours)
        if overall_stale:
            print(overall_stale)
        else:
            print("  All components OK and up to date.")
    print(f"{'='*68}\n")


# ── CloudWatch fallback ───────────────────────────────────────────────────────

def cw_last_event(logs_client, pattern: str, since_days: int = 7) -> datetime | None:
    """Search recent log streams for the most recent event matching pattern."""
    start_ms = int((datetime.now(timezone.utc) - timedelta(days=since_days)).timestamp() * 1000)
    try:
        resp = logs_client.filter_log_events(
            logGroupName=CW_LOG_GROUP,
            filterPattern=f'"{pattern}"',
            startTime=start_ms,
            limit=1,
        )
        events = resp.get("events", [])
        if events:
            ts_ms = events[-1]["timestamp"]
            return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    except ClientError:
        pass
    return None


def print_from_cloudwatch(logs_client, stale_hours: int):
    print(f"\n{'='*68}")
    print(f"  LOXO DATA SYNC STATUS  (source: CloudWatch — no S3 status yet)")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"  Note: Run sync_all.py once to enable the faster S3 status source.")
    _hr()

    any_warning = False
    for key, signature in CW_SIGNATURES.items():
        label    = LABELS.get(key, key)
        last_run = cw_last_event(logs_client, signature)
        if last_run:
            status_str = f"last seen {_fmt_dt(last_run)}  ({_ago(last_run)})"
        else:
            status_str = "no recent run found (searched last 7 days)"
        print(f"  {label:<24}  {status_str}")
        w = _stale_warning(last_run, stale_hours)
        if w:
            print(f"  {w}")
            any_warning = True

    _hr()
    if not any_warning:
        print("  All components appear up to date.")
    print(f"{'='*68}\n")
    print("  Tip: once sync_all.py has run once, this script will show")
    print("  exact counts and error details from the S3 status file.\n")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Show Loxo data sync status")
    parser.add_argument("--profile",     default="admin",        help="AWS CLI profile")
    parser.add_argument("--stale-hours", type=int, default=STALE_DEFAULT,
                        help=f"Hours before a component is flagged stale (default: {STALE_DEFAULT})")
    parser.add_argument("--full",        action="store_true",    help="Show last log tail per component")
    args = parser.parse_args()

    session    = boto3.Session(profile_name=args.profile, region_name=AWS_REGION)
    s3_client  = session.client("s3",  region_name=AWS_REGION)
    logs_client = session.client("logs", region_name=AWS_REGION)

    status = load_s3_status(s3_client)
    if status:
        print_from_s3(status, stale_hours=args.stale_hours, show_full=args.full)
    else:
        print("  (No S3 status file found — falling back to CloudWatch log scan)")
        print_from_cloudwatch(logs_client, stale_hours=args.stale_hours)


if __name__ == "__main__":
    main()
