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

# Hardcoded user pool IDs per app + environment.
# Add a new row here when deploying to a new environment.
case "${APP_ID}:${ENV}" in
  "d3carnh06cjb9r:dev")
    USER_POOL_ID="us-east-2_hN8Nv2ZW1"
    ;;
  "d3carnh06cjb9r:stage")
    USER_POOL_ID="us-east-2_bm23OC3k1"
    ;;
  "d3carnh06cjb9r:main")
    echo "Error: main not yet deployed."
    exit 1
    ;;
  *)
    echo "Error: Unknown app/environment combination: $APP_ID / $ENV"
    echo "  Add the user pool ID to the case statement in $(basename "$0")."
    exit 1
    ;;
esac

echo ""
echo "  AIR Cognito Scan — App: $APP_ID | Environment: $ENV"
echo "  User Pool: $USER_POOL_ID"
echo ""

aws cognito-idp list-users \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --output json \
  | jq -r '.Users[] | [.Attributes[] | select(.Name=="email") | .Value] + [.UserStatus, (.Enabled | tostring), (.UserCreateDate | tostring)] | @tsv' \
  | column -t -s $'\t'
