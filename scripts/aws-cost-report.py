#!/opt/anaconda3/bin/python
"""
AWS Cost Report
Shows last month's actual spend and projects the current month
based on spend-to-date, broken down by service.

Usage:
    python scripts/aws-cost-report.py
    python scripts/aws-cost-report.py --profile admin
    python scripts/aws-cost-report.py --min-cost 0.50   # hide services under $0.50
"""
import argparse
import sys
from datetime import date, timedelta
from calendar import monthrange

try:
    import boto3
except ImportError:
    sys.exit("boto3 not installed — run: pip install boto3")


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


def month_range(year: int, month: int) -> tuple[str, str]:
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    return first.strftime("%Y-%m-%d"), (last + timedelta(days=1)).strftime("%Y-%m-%d")


def prev_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


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


def main():
    parser = argparse.ArgumentParser(description="AWS monthly cost report with projection")
    parser.add_argument("--profile", default="admin", help="AWS CLI profile (default: admin)")
    parser.add_argument("--region", default="us-east-1", help="AWS region for Cost Explorer (default: us-east-1)")
    parser.add_argument("--min-cost", type=float, default=0.01, metavar="USD",
                        help="Hide services with cost below this threshold (default: $0.01)")
    args = parser.parse_args()

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    client = session.client("ce", region_name="us-east-1")  # CE is always us-east-1

    today = date.today()
    curr_year, curr_month = today.year, today.month
    prev_year, prev_mon = prev_month(curr_year, curr_month)

    # Previous full month
    prev_start, prev_end = month_range(prev_year, prev_mon)

    # Current month: first day to today
    curr_start = date(curr_year, curr_month, 1).strftime("%Y-%m-%d")
    curr_end_actual = today.strftime("%Y-%m-%d")           # up to (not including) today
    curr_end_full = (date(curr_year, curr_month, monthrange(curr_year, curr_month)[1]) + timedelta(days=1)).strftime("%Y-%m-%d")

    days_elapsed = (today - date(curr_year, curr_month, 1)).days  # days with complete data
    days_in_month = monthrange(curr_year, curr_month)[1]

    print(f"\n{'='*72}")
    print(f"  AWS COST REPORT  |  generated {today.strftime('%Y-%m-%d')}")
    print(f"{'='*72}")
    print(f"  Account profile : {args.profile}")
    print(f"  Previous month  : {prev_year}-{prev_mon:02d}  ({monthrange(prev_year, prev_mon)[1]} days)")
    print(f"  Current month   : {curr_year}-{curr_month:02d}  ({days_elapsed} of {days_in_month} days elapsed)")
    if days_elapsed > 0:
        print(f"  Projection basis: actual ÷ {days_elapsed} days × {days_in_month} days")

    # Fetch data
    print("\n  Fetching cost data from AWS Cost Explorer...", end="", flush=True)
    prev_costs = get_cost_by_service(client, prev_start, prev_end)
    if days_elapsed > 0:
        curr_costs = get_cost_by_service(client, curr_start, curr_end_actual)
    else:
        curr_costs = {}
    print(" done.")

    # Project current month to full month
    if days_elapsed > 0:
        scale = days_in_month / days_elapsed
        projected = {k: v * scale for k, v in curr_costs.items()}
    else:
        projected = dict(prev_costs)  # first day of month — use previous month as projection

    # Previous month table (no projection needed — it's complete)
    print_table(
        prev_costs,
        label=f"PREVIOUS MONTH — {prev_year}-{prev_mon:02d} (actual)",
        min_cost=args.min_cost,
    )

    # Current month table with projection
    print_table(
        curr_costs,
        label=f"CURRENT MONTH — {curr_year}-{curr_month:02d}  ({days_elapsed}/{days_in_month} days)  |  Projected full month →",
        projection=projected,
        min_cost=args.min_cost,
    )

    # Quick delta summary
    prev_total = sum(prev_costs.values())
    curr_total = sum(curr_costs.values())
    proj_total = sum(projected.values())
    delta = proj_total - prev_total
    direction = "▲" if delta > 0 else "▼"

    print(f"\n  Month-over-month projection: {fmt(prev_total)} → {fmt(proj_total)}  "
          f"({direction} {fmt(abs(delta))}  {abs(delta/prev_total*100):.1f}%)\n")


if __name__ == "__main__":
    main()
