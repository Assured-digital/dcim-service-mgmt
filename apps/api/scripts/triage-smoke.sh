#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-http://localhost:3001}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@dcm.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
VIEWER_EMAIL="${VIEWER_EMAIL:-client.viewer.test@dcm.local}"
VIEWER_PASSWORD="${VIEWER_PASSWORD:-Passw0rd!}"

login() {
  EMAIL="$1"
  PASSWORD="$2"
  curl -sS -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
}

echo "1) Login as admin and client viewer"
ADMIN_TOKEN="$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD" | jq -r '.accessToken // empty')"
VIEWER_TOKEN="$(login "$VIEWER_EMAIL" "$VIEWER_PASSWORD" | jq -r '.accessToken // empty')"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "FAIL: admin login failed"
  exit 1
fi
if [ -z "$VIEWER_TOKEN" ]; then
  echo "FAIL: client viewer login failed"
  exit 1
fi

echo "2) Create request intake"
CREATE_JSON="$(curl -sS -X POST "$BASE_URL/request-intakes" \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke test intake","description":"Smoke test request for triage lifecycle and conversion checks.","category":"operational","impact":"medium","urgency":"medium"}')"
INTAKE_ID="$(echo "$CREATE_JSON" | jq -r '.id // empty')"
if [ -z "$INTAKE_ID" ]; then
  echo "FAIL: could not create intake"
  echo "$CREATE_JSON"
  exit 1
fi
echo "Created intake: $INTAKE_ID"

echo "3) Move to UNDER_REVIEW"
STATUS_JSON="$(curl -sS -X POST "$BASE_URL/triage/REQUEST_INTAKE/$INTAKE_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"UNDER_REVIEW","triageNotes":"Smoke review started."}')"
STATUS="$(echo "$STATUS_JSON" | jq -r '.status // empty')"
if [ "$STATUS" != "UNDER_REVIEW" ]; then
  echo "FAIL: expected UNDER_REVIEW, got: $STATUS_JSON"
  exit 1
fi

echo "4) Convert to SERVICE_REQUEST"
CONVERT_JSON="$(curl -sS -X POST "$BASE_URL/triage/REQUEST_INTAKE/$INTAKE_ID/convert" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetType":"SERVICE_REQUEST","priority":"medium"}')"
TARGET_TYPE="$(echo "$CONVERT_JSON" | jq -r '.targetType // empty')"
if [ "$TARGET_TYPE" != "SERVICE_REQUEST" ]; then
  echo "FAIL: conversion failed: $CONVERT_JSON"
  exit 1
fi

echo "PASS: triage smoke checks completed"

