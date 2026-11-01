#!/usr/bin/env bash
# =============================================================================
# manage_schedule.sh — View and manage the nightly run_matching.py schedule
#
# Usage:
#   ./manage_schedule.sh              # Show current schedule status (default)
#   ./manage_schedule.sh view         # Same as above
#   ./manage_schedule.sh enable       # Enable the schedule
#   ./manage_schedule.sh disable      # Disable the schedule
#   ./manage_schedule.sh set-time 2 30  # Change to run at 02:30 UTC
#   ./manage_schedule.sh history      # Show recent run_matching log output
#
# Requirements: aws CLI, profile 'admin', region us-east-2
# =============================================================================

set -euo pipefail

SCHEDULE_NAME="sourcing-nightly-matching"
REGION="us-east-2"
PROFILE="admin"
LOG_GROUP="/ecs/sourcing-backend"

AWS="aws --region $REGION --profile $PROFILE"

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

_get_schedule_json() {
    $AWS scheduler get-schedule --name "$SCHEDULE_NAME" 2>&1
}

_print_status() {
    local json="$1"
    local state expr arn
    state=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State','?'))")
    expr=$(echo "$json"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ScheduleExpression','?'))")
    arn=$(echo "$json"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Arn','?'))")
    echo ""
    echo "Schedule : $SCHEDULE_NAME"
    echo "State    : $state"
    echo "Cron     : $expr  (UTC)"
    echo "ARN      : $arn"
    echo ""
}

_get_full_target() {
    # Extract the Target block from the existing schedule so we don't lose it on update
    local json="$1"
    echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['Target']))"
}

_update_schedule() {
    local state="$1"
    local cron_expr="$2"
    local schedule_json
    schedule_json=$(_get_schedule_json)
    local target
    target=$(_get_full_target "$schedule_json")

    $AWS scheduler update-schedule \
        --name "$SCHEDULE_NAME" \
        --state "$state" \
        --schedule-expression "$cron_expr" \
        --schedule-expression-timezone "UTC" \
        --flexible-time-window '{"Mode": "OFF"}' \
        --target "$target"
    echo "Updated: state=$state, schedule=$cron_expr"
}

# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #

cmd="${1:-view}"

case "$cmd" in

  view)
    echo "Fetching schedule..."
    json=$(_get_schedule_json)
    _print_status "$json"
    ;;

  enable)
    echo "Enabling schedule..."
    json=$(_get_schedule_json)
    expr=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ScheduleExpression','cron(0 0 * * ? *)'))")
    _update_schedule "ENABLED" "$expr"
    ;;

  disable)
    echo "Disabling schedule..."
    json=$(_get_schedule_json)
    expr=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ScheduleExpression','cron(0 0 * * ? *)'))")
    _update_schedule "DISABLED" "$expr"
    ;;

  set-time)
    # Usage: ./manage_schedule.sh set-time <hour> [minute]
    HOUR="${2:-0}"
    MINUTE="${3:-0}"
    CRON="cron($MINUTE $HOUR * * ? *)"
    echo "Setting schedule to $CRON UTC..."
    json=$(_get_schedule_json)
    state=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State','ENABLED'))")
    _update_schedule "$state" "$CRON"
    echo "Done. Run_matching.py will now run at $(printf '%02d:%02d' "$HOUR" "$MINUTE") UTC daily."
    ;;

  history)
    echo "Recent run_matching.py completions (CloudWatch logs):"
    echo ""
    $AWS logs filter-log-events \
        --log-group-name "$LOG_GROUP" \
        --filter-pattern '"Matching complete"' \
        --start-time "$(python3 -c 'import time; print(int((time.time()-7*86400)*1000))')" \
        --query 'events[*].{time:timestamp,msg:message}' \
        --output table 2>&1 | \
        python3 -c "
import sys
for line in sys.stdin:
    line = line.strip()
    if 'Matching complete' in line or '---' in line or 'time' in line.lower():
        print(line)
" || echo "(No recent matching runs found in logs)"
    ;;

  *)
    echo "Unknown command: $cmd"
    echo "Usage: $0 [view|enable|disable|set-time <hour> [minute]|history]"
    exit 1
    ;;

esac
