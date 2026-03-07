#!/bin/bash
set -euo pipefail

APP_ID="${1:-}"
ENV="${2:-}"

if [ -z "$APP_ID" ] || [ -z "$ENV" ]; then
  echo "Usage: $(basename "$0") <app-id> <environment>"
  echo "  app-id:      Amplify app ID (e.g. d3carnh06cjb9r)"
  echo "  environment: dev | stage | main"
  exit 1
fi

if [[ "$ENV" != "dev" && "$ENV" != "stage" && "$ENV" != "main" ]]; then
  echo "Error: environment must be one of: dev, stage, main"
  exit 1
fi

REGION="us-east-2"

# Hardcoded table names per app + environment.
# Add a new row here when deploying to a new environment.
# Format: APP_ID:ENV → user table name (subscription table shares same hash)
case "${APP_ID}:${ENV}" in
  "d3carnh06cjb9r:dev")
    USER_TABLE="User-6bxzhdzyl5hlnmzmp2jjyuq3be-NONE"
    ;;
  "d3carnh06cjb9r:stage")
    USER_TABLE="User-kr7kdmwvizcctkly2ivtjdh3ta-NONE"
    ;;
  "d3carnh06cjb9r:main")
    echo "Error: main not yet deployed."
    exit 1
    ;;
  *)
    echo "Error: Unknown app/environment combination: $APP_ID / $ENV"
    echo "  Add the table name to the case statement in $(basename "$0")."
    exit 1
    ;;
esac

SUB_TABLE="${USER_TABLE/User-/UserSubscription-}"

# Write Python scanner to a temp file (avoids shell/Python quoting conflicts)
TMPPY=$(mktemp /tmp/airscan_XXXXXX.py)
trap "rm -f $TMPPY" EXIT

cat > "$TMPPY" << 'PYEOF'
import json, sys
from datetime import datetime, timezone

TIMESTAMP_FIELDS = {"trialStart", "trialEnd", "currentPeriodStart", "currentPeriodEnd",
                    "canceledAt", "billingPeriodStart", "billingPeriodEnd"}

def fmt(key, val, indent=0):
    pad = "  " * indent
    if "S" in val: return val["S"] or "(empty)"
    if "NULL" in val: return "(null)"
    if "BOOL" in val: return str(val["BOOL"])
    if "N" in val:
        n = int(val["N"])
        if key in TIMESTAMP_FIELDS and n > 0:
            return datetime.fromtimestamp(n, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        return val["N"]
    if "L" in val:
        if not val["L"]: return "[]"
        return "[" + ", ".join(fmt(key, v, indent+1) for v in val["L"]) + "]"
    if "M" in val:
        if not val["M"]: return "{}"
        lines = [pad + "    " + k + ": " + fmt(k, v, indent+1) for k, v in val["M"].items()]
        return "{\n" + "\n".join(lines) + "\n" + pad + "  }"
    if "SS" in val: return "[" + ", ".join(val["SS"]) + "]"
    if "NS" in val: return "[" + ", ".join(val["NS"]) + "]"
    return str(val)

data = json.load(sys.stdin)
for item in data["Items"]:
    print("-" * 60)
    for k, v in sorted(item.items()):
        print("  {:<30} {}".format(k, fmt(k, v)))
print("\nTotal records: " + str(len(data["Items"])))
PYEOF

echo ""
echo "  AIR Database Scan — App: $APP_ID | Environment: $ENV"
echo ""

scan_table() {
  local TABLE="$1"
  aws dynamodb scan \
    --table-name "$TABLE" \
    --region "$REGION" \
    --output json | python3 "$TMPPY"
}

echo "════════════════════════════════════════════════════════════"
echo "  USER TABLE: $USER_TABLE"
echo "════════════════════════════════════════════════════════════"
scan_table "$USER_TABLE"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  SUBSCRIPTION TABLE: $SUB_TABLE"
echo "════════════════════════════════════════════════════════════"
scan_table "$SUB_TABLE"
