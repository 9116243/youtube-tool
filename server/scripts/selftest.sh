#!/usr/bin/env bash

# Lightweight integration script for the YouTube tool backend.
# Requirements: curl, jq, bash. Some steps expect the API to be running locally.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
TOKEN=""
AUTH_HEADER=""

log() {
  echo ""
  echo "=== $1 ==="
}

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local headers=(-H "Content-Type: application/json")
  if [[ -n "${AUTH_HEADER}" ]]; then
    headers+=(-H "${AUTH_HEADER}")
  fi

  if [[ -n "${body}" ]]; then
    curl --silent --fail "${headers[@]}" -X "${method}" "${BASE_URL}${path}" -d "${body}"
  else
    curl --silent --fail "${headers[@]}" -X "${method}" "${BASE_URL}${path}"
  fi
}

log "1. Health check"
api GET "/healthz" | jq .

log "2. Register/Login (gets token)"
EMAIL="${EMAIL:-demo+$(date +%s)@example.com}"
PASSWORD="${PASSWORD:-Passw0rd!}"
api POST "/auth/register" "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" || true
TOKEN=$(api POST "/auth/login" "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" | jq -r '.token')
AUTH_HEADER="Authorization: Bearer ${TOKEN}"
echo "Using token: ${TOKEN:0:16}..."

log "3. Create a task"
TASK=$(api POST "/pipeline/submit" '{"tasks":[{"title":"Caption Prep"}]}' | jq '.created[0]')
echo "${TASK}"
TASK_ID=$(echo "${TASK}" | jq -r '.id')

log "4. List tasks"
api GET "/tasks" | jq .

log "5. Fetch single task"
api GET "/tasks/${TASK_ID}" | jq .

log "6. Pause / Resume / Cancel"
api PATCH "/tasks/${TASK_ID}" '{"action":"pause"}' | jq .
api PATCH "/tasks/${TASK_ID}" '{"action":"resume"}' | jq .
api PATCH "/tasks/${TASK_ID}" '{"action":"cancel"}' | jq .

log "7. Pipeline submit with dependsOn"
api POST "/pipeline/submit" '{
  "tasks": [
    { "title": "Download subtitles", "params": {"videoId": "xyz"} },
    { "title": "Voiceover", "dependsOn": ["1"], "params": {"voice":"en"} }
  ]
}' | jq .

log "8. Publish schedule (create + list)"
api POST "/publish/schedule" "$(jq -n '{"title":"Demo Release","description":"Testing","scheduledFor":(now+3600)|todateiso8601}')" | jq .
api GET "/publish/list" | jq .

log "9. AI title generation"
echo "If OPENAI_API_KEY is set server-side, /ai/titles uses real responses. Otherwise returns mock titles with mock:true."
api POST "/ai/titles" '{"topic":"AI workflow automation","language":"English","count":3}' | jq .

log "10. A/B workflow placeholder"
api POST "/ab/upload" '{"testName":"Homepage", "samples":[{"variant":"A","payload":{"ctr":0.2}},{"variant":"B"}]}' | jq .
api GET "/ab/stats" | jq .
api POST "/ab/fit" '{}' | jq .
api GET "/ab/report" | jq .

log "11. SSE guidance"
cat <<EOF
To inspect live updates for a task, open this URL in a browser or use curl with --no-buffer:
  ${BASE_URL}/events?taskId=<TASK_ID>
Make sure you pass the Authorization header (Bearer token) when testing via curl:
  curl -H "Authorization: Bearer ${TOKEN}" --no-buffer "${BASE_URL}/events?taskId=${TASK_ID}"
EOF

log "Self-test complete"
