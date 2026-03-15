#!/usr/bin/env bash
# run_tests.sh — Run the chatbot test suite against the deployed dev backend.
#
# Usage:
#   ./scripts/run_tests.sh                      # all tests
#   ./scripts/run_tests.sh -k "job_detail"       # filter by name
#   ./scripts/run_tests.sh -k "recruiter"        # only recruiter question tests
#   ./scripts/run_tests.sh -v --tb=short         # verbose with short tracebacks
#
# Environment variables:
#   TEST_BASE_URL   — override backend URL (default: https://sourcing.dev.hireassist.net)
#   TEST_USER_TOKEN — override user token (default: test-user-pytest)
#
# Example against local server:
#   TEST_BASE_URL=http://localhost:8000 ./scripts/run_tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/ is a sibling of backend/ inside Product/Sourcing/
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"

echo "Running tests from: $BACKEND_DIR"
echo "Target: ${TEST_BASE_URL:-https://sourcing.dev.hireassist.net}"
echo "---"

cd "$BACKEND_DIR"
python -m pytest tests/ -v "$@"
