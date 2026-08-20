#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

echo "Running smoke tests against: ${BASE_URL}"

# 1. Health check
echo "1. Checking /api/health..."
HEALTH_RESP=$(curl -fsS "${BASE_URL}/api/health")
echo "   Response: ${HEALTH_RESP}"
if [[ "${HEALTH_RESP}" != *'"ok":true'* ]]; then
  echo "FAIL: Health check did not return ok: true"
  exit 1
fi

# 2. Tree check
echo "2. Checking /api/tree..."
TREE_RESP=$(curl -fsS "${BASE_URL}/api/tree")
if [[ "${TREE_RESP}" != *'"items":'* ]]; then
  echo "FAIL: Tree check did not return items"
  exit 1
fi
echo "   Tree returned valid items structure."

# 3. Custom CSS check
echo "3. Checking /custom.css..."
curl -fsS -o /dev/null "${BASE_URL}/custom.css"
echo "   Custom CSS endpoint returned HTTP 200."

echo "All smoke checks passed successfully!"
