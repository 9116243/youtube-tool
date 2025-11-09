#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
SSE_URL="${SSE_URL:-${BASE_URL}/events}"
EMAIL="${EMAIL:-demo@example.com}"
PASSWORD="${PASSWORD:-Passw0rd!}"
TMP_DIR="$(mktemp -d)"
AUTH_HEADER=""

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

info() {
  echo "[${1}] ${2}"
}

curl_json() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local headers=("${AUTH_HEADER}" "Content-Type: application/json")
  local args=()

  for header in "${headers[@]}"; do
    if [[ -n "${header}" ]]; then
      args+=(-H "${header}")
    fi
  done

  if [[ -n "${data}" ]]; then
    args+=(-d "${data}")
  fi

  curl --silent --show-error --fail \
    -X "${method}" \
    "${args[@]}" \
    "${url}"
}

step=1

info "${step}/12" "Health check"
curl --silent --show-error --fail "${BASE_URL}/healthz" | jq .
((step++))

info "${step}/12" "Registering demo user (${EMAIL})"
curl --silent --show-error \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  "${BASE_URL}/auth/register" \
  | jq . || true
((step++))

info "${step}/12" "Logging in"
TOKEN=$(curl_json POST "${BASE_URL}/auth/login" "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" | jq -r '.token')
AUTH_HEADER="Authorization: Bearer ${TOKEN}"
echo "Token acquired"
((step++))

info "${step}/12" "Creating primary task"
TASK_JSON=$(curl_json POST "${BASE_URL}/tasks" '{"title":"Subtitle Ingest","params":{"file":"captions.srt"}}' | tee "${TMP_DIR}/task.json")
TASK_ID=$(echo "${TASK_JSON}" | jq -r '.id')
echo "Task ID: ${TASK_ID}"
((step++))

info "${step}/12" "Listing tasks"
curl_json GET "${BASE_URL}/tasks" | jq .
((step++))

info "${step}/12" "Pausing then resuming the task"
sleep 1
curl_json PATCH "${BASE_URL}/tasks/${TASK_ID}" '{"action":"pause"}' | jq .
sleep 1
curl_json PATCH "${BASE_URL}/tasks/${TASK_ID}" '{"action":"resume"}' | jq .
((step++))

info "${step}/12" "Submitting pipeline batch"
curl_json POST "${BASE_URL}/pipeline/submit" '{
  "tasks": [
    { "id": "pipeline-caption", "title": "Pipeline Caption", "params": {"file":"captions-2.srt"} },
    { "id": "pipeline-voice", "title": "Pipeline TTS", "dependsOn": ["pipeline-caption"], "params": {"voice":"en-US"} },
    { "id": "pipeline-burn", "title": "Pipeline Burn", "dependsOn": ["pipeline-voice"], "params": {"format":"mp4"} }
  ]
}' | jq .
((step++))

info "${step}/12" "Opening SSE stream (5s)"
timeout 5s curl --silent --show-error --no-buffer \
  -H "${AUTH_HEADER}" \
  "${SSE_URL}?taskId=${TASK_ID}" || true
echo
((step++))

info "${step}/12" "Scheduling publish slot"
curl_json POST "${BASE_URL}/publish/schedule" "$(jq -n --arg date "$(date -u -d '+1 hour' --iso-8601=seconds 2>/dev/null || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")" '{"title":"Launch Video","description":"Demo release","scheduledFor":$date}')" | jq .
((step++))

info "${step}/12" "AI title suggestions (mock if no key)"
curl_json POST "${BASE_URL}/ai/titles" '{"topic":"AI automation for YouTube","language":"English","count":3}' | jq .
((step++))

info "${step}/12" "A/B workflow (upload -> stats -> fit -> report)"
curl_json POST "${BASE_URL}/ab/upload" '{"samples":[{"variant":"A","payload":{"ctr":0.12}},{"variant":"B","payload":{"ctr":0.14}}]}' | jq .
curl_json GET "${BASE_URL}/ab/stats" | jq .
curl_json POST "${BASE_URL}/ab/fit" '{"note":"Dry run"}' | jq .
curl_json GET "${BASE_URL}/ab/report" | jq .
((step++))

info "${step}/12" "Analytics overview"
curl_json GET "${BASE_URL}/analytics/overview" | jq .

echo
echo "Self-test sequence complete."
