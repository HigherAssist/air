#!/opt/anaconda3/bin/python
"""
AWS Cost Report
Shows last month's actual spend and projects the current month based on
spend-to-date, broken down by service. Optional flags add a multi-month
trend, a usage-type breakdown of the top cost drivers, and a scan for
idle/orphaned resources that are quietly costing money.

Usage:
    python scripts/aws-cost-report.py                    # last month + current month projection (default)
    python scripts/aws-cost-report.py --trend 6           # 6-month history by service
    python scripts/aws-cost-report.py --breakdown          # usage-type breakdown of the top services, last complete month
    python scripts/aws-cost-report.py --waste-scan          # scan for idle EC2/EBS/EIP/target-group/snapshot waste (read-only)
    python scripts/aws-cost-report.py --all                  # run everything above in sequence
    python scripts/aws-cost-report.py --profile admin --min-cost 0.50

Notes:
    --waste-scan is READ-ONLY. It only reports candidates — it never deletes,
    terminates, or releases anything. Confirm each finding before acting on it.

    Elastic IP ownership check: an EIP with no InstanceId is NOT automatically
    "unused" — it can still be attached to an ENI owned by an ALB, RDS instance,
    NAT gateway, etc. This script resolves the owning ENI's Description/
    RequesterId before ever calling an EIP a waste candidate. (Learned the hard
    way: a first-pass manual analysis on 2026-08-15 nearly released 2 production
    ALB EIPs and 1 RDS EIP that had InstanceId=None but were very much in use.
    See memory/aws-cost-optimization-2026-08-15.md for the full story.)
"""
import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from calendar import monthrange

try:
    import boto3
except ImportError:
    sys.exit("boto3 not installed — run: pip install boto3")


# --------------------------------------------------------------------------- #
# Cost Explorer helpers
# --------------------------------------------------------------------------- #

def get_cost_by_service(client, start: str, end: str) -> dict[str, float]:
    results = {}
    kwargs = dict(
        TimePeriod={"Start": start, "End": end},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
        GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
    )
    while True:
        resp = client.get_cost_and_usage(**kwargs)
        for period in resp["ResultsByTime"]:
            for group in period["Groups"]:
                service = group["Keys"][0]
                amount = float(group["Metrics"]["UnblendedCost"]["Amount"])
                results[service] = results.get(service, 0.0) + amount
        token = resp.get("NextPageToken")
        if not token:
            break
        kwargs["NextPageToken"] = token
    return results


def get_usage_breakdown(client, start: str, end: str, service: str) -> dict[str, tuple[float, float]]:
    """Per-usage-type cost + quantity for one service over one period."""
    results = {}
    kwargs = dict(
        TimePeriod={"Start": start, "End": end},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost", "UsageQuantity"],
        GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
        Filter={"Dimensions": {"Key": "SERVICE", "Values": [service]}},
    )
    while True:
        resp = client.get_cost_and_usage(**kwargs)
        for period in resp["ResultsByTime"]:
            for group in period["Groups"]:
                ut = group["Keys"][0]
                cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
                qty = float(group["Metrics"]["UsageQuantity"]["Amount"])
                c0, q0 = results.get(ut, (0.0, 0.0))
                results[ut] = (c0 + cost, q0 + qty)
        token = resp.get("NextPageToken")
        if not token:
            break
        kwargs["NextPageToken"] = token
    return results


def month_range(year: int, month: int) -> tuple[str, str]:
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    return first.strftime("%Y-%m-%d"), (last + timedelta(days=1)).strftime("%Y-%m-%d")


def shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    """Move `delta` months from (year, month). Negative = backward."""
    idx = (year * 12 + (month - 1)) + delta
    return idx // 12, idx % 12 + 1


def prev_month(year: int, month: int) -> tuple[int, int]:
    return shift_month(year, month, -1)


def hr(char="-", width=72):
    print(char * width)


def fmt(amount: float) -> str:
    return f"${amount:>9.2f}"


def print_table(costs: dict[str, float], label: str, projection: dict[str, float] | None = None, min_cost: float = 0.01):
    total = sum(costs.values())
    proj_total = sum(projection.values()) if projection else None

    if projection:
        header = f"  {'Service':<48} {'Actual':>10}  {'Projected':>10}"
    else:
        header = f"  {'Service':<48} {'Cost':>10}"

    print(f"\n{label}")
    hr("=")
    print(header)
    hr()

    visible = {k: v for k, v in costs.items() if v >= min_cost or (projection and projection.get(k, 0) >= min_cost)}
    for service in sorted(visible, key=lambda s: costs[s], reverse=True):
        actual = costs[service]
        if projection:
            proj = projection.get(service, 0.0)
            print(f"  {service:<48} {fmt(actual)}  {fmt(proj)}")
        else:
            print(f"  {service:<48} {fmt(actual)}")

    hr()
    if projection:
        print(f"  {'TOTAL':<48} {fmt(total)}  {fmt(proj_total)}")
    else:
        print(f"  {'TOTAL':<48} {fmt(total)}")
    hr("=")


# --------------------------------------------------------------------------- #
# --trend : N-month history by service
# --------------------------------------------------------------------------- #

def run_trend(ce_client, months_back: int, min_cost: float):
    today = date.today()
    cy, cm = prev_month(today.year, today.month)  # most recent COMPLETE month
    month_keys = []
    for i in range(months_back - 1, -1, -1):
        y, m = shift_month(cy, cm, -i)
        month_keys.append((y, m))

    print(f"\n{'='*72}")
    print(f"  {months_back}-MONTH TREND  |  by service")
    print(f"{'='*72}")
    print("\n  Fetching cost data from AWS Cost Explorer...", end="", flush=True)

    data = {}
    for y, m in month_keys:
        s, e = month_range(y, m)
        data[f"{y}-{m:02d}"] = get_cost_by_service(ce_client, s, e)
    print(" done.")

    months = list(data.keys())
    services = set()
    for m in months:
        services.update(data[m].keys())
    totals = {m: sum(data[m].values()) for m in months}
    # only show services that clear min_cost in at least one month
    services = [s for s in services if any(data[m].get(s, 0) >= min_cost for m in months)]
    services.sort(key=lambda s: data[months[-1]].get(s, 0), reverse=True)

    col_w = 12
    header = f"  {'Service':<45}" + "".join(f"{m:>{col_w}}" for m in months)
    print(f"\n{header}")
    hr("=", len(header))
    for s in services:
        row = f"  {s:<45}" + "".join(f"{fmt(data[m].get(s, 0)):>{col_w}}" for m in months)
        print(row)
    hr("-", len(header))
    total_row = f"  {'TOTAL':<45}" + "".join(f"{fmt(totals[m]):>{col_w}}" for m in months)
    print(total_row)
    hr("=", len(header))
    print()


# --------------------------------------------------------------------------- #
# --breakdown : usage-type breakdown of the top cost drivers
# --------------------------------------------------------------------------- #

def run_breakdown(ce_client, top_n: int, min_cost: float):
    today = date.today()
    y, m = prev_month(today.year, today.month)
    start, end = month_range(y, m)

    print(f"\n{'='*72}")
    print(f"  USAGE-TYPE BREAKDOWN  |  {y}-{m:02d} (last complete month), top {top_n} services")
    print(f"{'='*72}")

    print("\n  Fetching cost data from AWS Cost Explorer...", end="", flush=True)
    by_service = get_cost_by_service(ce_client, start, end)
    top_services = sorted(by_service, key=lambda s: by_service[s], reverse=True)[:top_n]
    print(" done.")

    for svc in top_services:
        bd = get_usage_breakdown(ce_client, start, end, svc)
        if not bd:
            continue
        print(f"\n  {svc}  ({fmt(by_service[svc]).strip()})")
        hr()
        for ut, (cost, qty) in sorted(bd.items(), key=lambda x: -x[1][0]):
            if cost < min_cost:
                continue
            print(f"    {ut:<52} {fmt(cost)}   qty={qty:,.2f}")
    print()


# --------------------------------------------------------------------------- #
# --waste-scan : idle / orphaned resources that are quietly costing money
#
# READ-ONLY. Never deletes, terminates, stops, or releases anything.
# --------------------------------------------------------------------------- #

WASTE_STOPPED_INSTANCE_DAYS = 14  # flag instances stopped longer than this


def _days_since(iso_ts: str) -> int:
    dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).days


def scan_stopped_instances(ec2) -> list[dict]:
    """Long-stopped EC2 instances — no compute cost, but attached EBS keeps billing."""
    findings = []
    paginator = ec2.get_paginator("describe_instances")
    for page in paginator.paginate(Filters=[{"Name": "instance-state-name", "Values": ["stopped"]}]):
        for res in page["Reservations"]:
            for inst in res["Instances"]:
                name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), inst["InstanceId"])
                reason = inst.get("StateTransitionReason", "")
                # StateTransitionReason looks like "User initiated (2025-08-04 17:41:33 GMT)"
                stopped_days = None
                if "(" in reason and ")" in reason:
                    ts = reason.split("(", 1)[1].rsplit(")", 1)[0]
                    try:
                        dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S %Z").replace(tzinfo=timezone.utc)
                        stopped_days = (datetime.now(timezone.utc) - dt).days
                    except ValueError:
                        pass
                if stopped_days is not None and stopped_days < WASTE_STOPPED_INSTANCE_DAYS:
                    continue
                vol_ids = [bdm["Ebs"]["VolumeId"] for bdm in inst.get("BlockDeviceMappings", []) if "Ebs" in bdm]
                total_gb = 0
                if vol_ids:
                    vols = ec2.describe_volumes(VolumeIds=vol_ids)["Volumes"]
                    total_gb = sum(v["Size"] for v in vols)
                findings.append({
                    "id": inst["InstanceId"],
                    "name": name,
                    "type": inst["InstanceType"],
                    "stopped_days": stopped_days if stopped_days is not None else "unknown",
                    "volumes": vol_ids,
                    "total_gb": total_gb,
                })
    return findings


def scan_unattached_volumes(ec2) -> list[dict]:
    """EBS volumes not attached to anything — pure waste, always safe to review."""
    vols = ec2.describe_volumes(Filters=[{"Name": "status", "Values": ["available"]}])["Volumes"]
    return [{"id": v["VolumeId"], "size_gb": v["Size"], "type": v["VolumeType"],
              "created": v["CreateTime"].strftime("%Y-%m-%d")} for v in vols]


def scan_idle_eips(ec2) -> list[dict]:
    """
    Elastic IPs that are truly idle.

    IMPORTANT: an address with InstanceId=None is NOT necessarily unused — it can
    still be attached to an ENI owned by an ALB, RDS, NAT gateway, etc. We resolve
    the owning ENI (if any) and only flag the address if:
      (a) it has no association at all, OR
      (b) its ENI is attached to an EC2 instance that is stopped or terminated
          (i.e. no longer serving traffic).
    Anything owned by a AWS-managed service (RequesterId != the account, e.g.
    "amazon-elb", "amazon-rds") is always treated as in-use and skipped.
    """
    findings = []
    addresses = ec2.describe_addresses()["Addresses"]
    for addr in addresses:
        eni_id = addr.get("NetworkInterfaceId")
        ip = addr.get("PublicIp")
        alloc_id = addr.get("AllocationId")

        if not eni_id:
            findings.append({"ip": ip, "alloc_id": alloc_id, "reason": "no association at all"})
            continue

        eni = ec2.describe_network_interfaces(NetworkInterfaceIds=[eni_id])["NetworkInterfaces"][0]
        requester = eni.get("RequesterId", "")
        description = eni.get("Description", "")
        attached_instance = eni.get("Attachment", {}).get("InstanceId")

        if requester and not requester.isdigit():
            # AWS-managed owner (amazon-elb, amazon-rds, amazon-elasticache, ...) — always in use
            continue

        if attached_instance:
            state = ec2.describe_instances(InstanceIds=[attached_instance])["Reservations"][0]["Instances"][0]["State"]["Name"]
            if state in ("stopped", "terminated", "shutting-down"):
                findings.append({"ip": ip, "alloc_id": alloc_id,
                                  "reason": f"attached to {attached_instance} which is {state}"})
            # else: attached to a running instance — in use, skip
        else:
            findings.append({"ip": ip, "alloc_id": alloc_id,
                              "reason": f"ENI {eni_id} ({description or 'no description'}) has no instance attachment"})
    return findings


def scan_orphaned_target_groups(elbv2) -> list[dict]:
    """Target groups not attached to any load balancer — free, but dead weight."""
    findings = []
    paginator = elbv2.get_paginator("describe_target_groups")
    for page in paginator.paginate():
        for tg in page["TargetGroups"]:
            if not tg.get("LoadBalancerArns"):
                findings.append({"name": tg["TargetGroupName"], "arn": tg["TargetGroupArn"]})
    return findings


def scan_orphaned_snapshots(ec2) -> list[dict]:
    """Snapshots whose source volume no longer exists and aren't backing any AMI."""
    snapshots = ec2.describe_snapshots(OwnerIds=["self"])["Snapshots"]
    images = ec2.describe_images(Owners=["self"])["Images"]
    ami_snapshot_ids = {
        bdm["Ebs"]["SnapshotId"]
        for img in images for bdm in img.get("BlockDeviceMappings", []) if "Ebs" in bdm and "SnapshotId" in bdm["Ebs"]
    }
    existing_volume_ids = {v["VolumeId"] for v in ec2.describe_volumes()["Volumes"]}

    findings = []
    for snap in snapshots:
        if snap["SnapshotId"] in ami_snapshot_ids:
            continue  # still backs a registered AMI — not orphaned
        if snap.get("VolumeId") in existing_volume_ids:
            continue  # source volume still exists — a live backup, not orphaned
        findings.append({
            "id": snap["SnapshotId"], "size_gb": snap["VolumeSize"],
            "description": snap.get("Description", ""),
            "started": snap["StartTime"].strftime("%Y-%m-%d"),
        })
    return findings


def run_waste_scan(session, region: str):
    ec2 = session.client("ec2", region_name=region)
    elbv2 = session.client("elbv2", region_name=region)

    print(f"\n{'='*72}")
    print(f"  WASTE SCAN  |  region {region}  (READ-ONLY — reports candidates only)")
    print(f"{'='*72}")

    print("\n  Scanning EC2 instances, EBS volumes, Elastic IPs, target groups, snapshots...", end="", flush=True)
    stopped = scan_stopped_instances(ec2)
    unattached_vols = scan_unattached_volumes(ec2)
    idle_eips = scan_idle_eips(ec2)
    orphan_tgs = scan_orphaned_target_groups(elbv2)
    orphan_snaps = scan_orphaned_snapshots(ec2)
    print(" done.")

    if stopped:
        print(f"\n  Long-stopped EC2 instances (>{WASTE_STOPPED_INSTANCE_DAYS}d) — EBS still billing:")
        for f in stopped:
            print(f"    {f['id']}  {f['name']:<20}  {f['type']:<10}  stopped {f['stopped_days']}d  "
                  f"{f['total_gb']}GB across {len(f['volumes'])} volume(s)")
    else:
        print("\n  No long-stopped EC2 instances found.")

    if unattached_vols:
        print(f"\n  Unattached EBS volumes (pure waste, nothing uses them):")
        for f in unattached_vols:
            print(f"    {f['id']}  {f['size_gb']}GB  {f['type']}  created {f['created']}")
    else:
        print("\n  No unattached EBS volumes found.")

    if idle_eips:
        print(f"\n  Idle Elastic IPs (verified: not owned by ALB/RDS/etc., not on a running instance):")
        for f in idle_eips:
            print(f"    {f['ip']}  ({f['alloc_id']})  — {f['reason']}")
    else:
        print("\n  No idle Elastic IPs found (all are either unassociated-and-flagged-above, in active use, or AWS-managed).")

    if orphan_tgs:
        print(f"\n  Target groups not attached to any load balancer (free, but dead weight):")
        for f in orphan_tgs:
            print(f"    {f['name']}")
    else:
        print("\n  No orphaned target groups found.")

    if orphan_snaps:
        print(f"\n  Orphaned snapshots (source volume gone, not backing any AMI):")
        for f in orphan_snaps:
            print(f"    {f['id']}  {f['size_gb']}GB  started {f['started']}  — {f['description']}")
    else:
        print("\n  No orphaned snapshots found.")

    print(f"\n  {len(stopped) + len(unattached_vols) + len(idle_eips) + len(orphan_tgs) + len(orphan_snaps)} "
          f"total candidate(s) found. Nothing was deleted, stopped, or released — review before acting.\n")


# --------------------------------------------------------------------------- #
# Default report: last month actual + current month projection
# --------------------------------------------------------------------------- #

def run_default_report(ce_client, profile: str, min_cost: float):
    today = date.today()
    curr_year, curr_month = today.year, today.month
    prev_year, prev_mon = prev_month(curr_year, curr_month)

    prev_start, prev_end = month_range(prev_year, prev_mon)
    curr_start = date(curr_year, curr_month, 1).strftime("%Y-%m-%d")
    curr_end_actual = today.strftime("%Y-%m-%d")

    days_elapsed = (today - date(curr_year, curr_month, 1)).days
    days_in_month = monthrange(curr_year, curr_month)[1]

    print(f"\n{'='*72}")
    print(f"  AWS COST REPORT  |  generated {today.strftime('%Y-%m-%d')}")
    print(f"{'='*72}")
    print(f"  Account profile : {profile}")
    print(f"  Previous month  : {prev_year}-{prev_mon:02d}  ({monthrange(prev_year, prev_mon)[1]} days)")
    print(f"  Current month   : {curr_year}-{curr_month:02d}  ({days_elapsed} of {days_in_month} days elapsed)")
    if days_elapsed > 0:
        print(f"  Projection basis: actual ÷ {days_elapsed} days × {days_in_month} days")

    print("\n  Fetching cost data from AWS Cost Explorer...", end="", flush=True)
    prev_costs = get_cost_by_service(ce_client, prev_start, prev_end)
    curr_costs = get_cost_by_service(ce_client, curr_start, curr_end_actual) if days_elapsed > 0 else {}
    print(" done.")

    if days_elapsed > 0:
        scale = days_in_month / days_elapsed
        projected = {k: v * scale for k, v in curr_costs.items()}
    else:
        projected = dict(prev_costs)

    print_table(prev_costs, label=f"PREVIOUS MONTH — {prev_year}-{prev_mon:02d} (actual)", min_cost=min_cost)
    print_table(
        curr_costs,
        label=f"CURRENT MONTH — {curr_year}-{curr_month:02d}  ({days_elapsed}/{days_in_month} days)  |  Projected full month →",
        projection=projected,
        min_cost=min_cost,
    )

    prev_total = sum(prev_costs.values())
    proj_total = sum(projected.values())
    delta = proj_total - prev_total
    direction = "▲" if delta > 0 else "▼"
    if prev_total > 0:
        print(f"\n  Month-over-month projection: {fmt(prev_total)} → {fmt(proj_total)}  "
              f"({direction} {fmt(abs(delta))}  {abs(delta/prev_total*100):.1f}%)\n")


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="AWS cost report: monthly projection, trend, breakdown, waste scan")
    parser.add_argument("--profile", default="admin", help="AWS CLI profile (default: admin)")
    parser.add_argument("--region", default="us-east-2", help="AWS region for EC2/ELB waste scan (default: us-east-2)")
    parser.add_argument("--min-cost", type=float, default=0.01, metavar="USD",
                        help="Hide line items below this threshold (default: $0.01)")
    parser.add_argument("--trend", type=int, metavar="N", default=None,
                        help="Show N-month cost history by service instead of the default report")
    parser.add_argument("--breakdown", action="store_true",
                        help="Show usage-type breakdown of the top cost drivers for the last complete month")
    parser.add_argument("--top", type=int, default=5, metavar="N",
                        help="Number of top services to break down with --breakdown (default: 5)")
    parser.add_argument("--waste-scan", action="store_true",
                        help="Scan for idle/orphaned EC2, EBS, EIP, target-group, and snapshot waste (read-only)")
    parser.add_argument("--all", action="store_true",
                        help="Run the default report, a 6-month trend, breakdown, and waste scan, in sequence")
    args = parser.parse_args()

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    ce_client = session.client("ce", region_name="us-east-1")  # Cost Explorer is always us-east-1

    ran_something = False

    if args.all or (not args.trend and not args.breakdown and not args.waste_scan):
        run_default_report(ce_client, args.profile, args.min_cost)
        ran_something = True

    if args.all or args.trend:
        run_trend(ce_client, args.trend or 6, args.min_cost)
        ran_something = True

    if args.all or args.breakdown:
        run_breakdown(ce_client, args.top, args.min_cost)
        ran_something = True

    if args.all or args.waste_scan:
        run_waste_scan(session, args.region)
        ran_something = True

    if not ran_something:
        parser.print_help()


if __name__ == "__main__":
    main()
