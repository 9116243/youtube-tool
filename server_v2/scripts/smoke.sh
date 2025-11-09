#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3001}"
WORK_DIR="${WORK_DIR:-./workspace}"
EVENT_TIMEOUT="${EVENT_TIMEOUT:-6}"
POLL_INTERVAL="${POLL_INTERVAL:-1}"

log() {
  printf '[smoke] %s\n' "$*"
}

has_jq() {
  command -v jq >/dev/null 2>&1
}

curl_json() {
  curl --fail --silent --show-error "$@"
}

read_field() {
  local json="$1"
  local field="$2"
  if has_jq; then
    printf '%s' "$json" | jq -r ".$field"
  else
    JSON_FIELD_PAYLOAD="$json" python - "$field" <<'PY'
import json
import os
import sys

payload = os.environ.get('JSON_FIELD_PAYLOAD', '{}')
data = json.loads(payload)
field = sys.argv[1]
value = data
for part in field.split('.'):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    sys.exit(1)
if isinstance(value, (dict, list)):
    print(json.dumps(value))
else:
    print(value)
PY
  fi
}

observe_events() {
  local task_id="$1"
  local label="$2"
  log "Watching /events for ${label} (${task_id})"
  set +e
  curl --no-buffer --silent --max-time "${EVENT_TIMEOUT}" "${BASE}/events?taskId=${task_id}"
  local status=$?
  set -e
  if [[ $status -ne 0 && $status -ne 28 ]]; then
    log "Event stream exited with code ${status}"
  fi
}

wait_for_task() {
  local task_id="$1"
  local label="$2"
  local status=""
  while true; do
    local resp
    resp=$(curl_json "${BASE}/tasks/${task_id}")
    status=$(read_field "$resp" "status" || echo "unknown")
    if [[ "$status" == "success" ]]; then
      log "${label} (${task_id}) completed"
      break
    fi
    if [[ "$status" == "failed" || "$status" == "cancelled" ]]; then
      log "${label} (${task_id}) ended with status ${status}"
      printf '%s\n' "$resp"
      exit 1
    fi
    sleep "${POLL_INTERVAL}"
  done
}

print_artifacts() {
  local task_id="$1"
  local label="$2"
  local file="${WORK_DIR%/}/${task_id}/artifacts.json"
  if [[ -f "$file" ]]; then
    log "Artifacts for ${label} (${task_id}) -> ${file}"
    cat "$file"
  else
    log "Artifacts missing for ${label} (${task_id}) at ${file}"
  fi
}

create_task() {
  local payload="$1"
  curl_json -H "Content-Type: application/json" -d "$payload" "${BASE}/tasks"
}

log "Creating subtitle task (A)"
subtitle_payload=$(cat <<'JSON'
{
  "title": "Smoke Subtitle",
  "params": {
    "kind": "subtitle",
    "language": "en-US",
    "inputAudio": "./sample.wav"
  }
}
JSON
)
subtitle_resp=$(create_task "$subtitle_payload")
subtitle_id=$(read_field "$subtitle_resp" "id")
log "Subtitle task id: ${subtitle_id}"
observe_events "$subtitle_id" "subtitle"
wait_for_task "$subtitle_id" "subtitle"

log "Creating dubbing task (B)"
dubbing_payload=$(cat <<JSON
{
  "title": "Smoke Dubbing",
  "dependsOn": ["${subtitle_id}"],
  "params": {
    "kind": "dubbing",
    "provider": "mock",
    "language": "en-US",
    "inputSubtitle": {
      "from": "${subtitle_id}",
      "artifact": "srt"
    }
  }
}
JSON
)
dubbing_resp=$(create_task "$dubbing_payload")
dubbing_id=$(read_field "$dubbing_resp" "id")
log "Dubbing task id: ${dubbing_id}"
observe_events "$dubbing_id" "dubbing"
wait_for_task "$dubbing_id" "dubbing"

log "Creating burn task (C)"
burn_payload=$(cat <<JSON
{
  "title": "Smoke Burn",
  "dependsOn": ["${subtitle_id}", "${dubbing_id}"],
  "params": {
    "kind": "burn",
    "inputVideo": "./sample.mp4",
    "inputAudio": {
      "from": "${dubbing_id}",
      "artifact": "tts_wav"
    },
    "inputSubtitle": {
      "from": "${subtitle_id}",
      "artifact": "srt"
    },
    "resolution": "1920x1080",
    "codec": "libx264",
    "container": "mp4"
  }
}
JSON
)
burn_resp=$(create_task "$burn_payload")
burn_id=$(read_field "$burn_resp" "id")
log "Burn task id: ${burn_id}"
observe_events "$burn_id" "burn"
wait_for_task "$burn_id" "burn"

print_artifacts "$subtitle_id" "subtitle"
print_artifacts "$dubbing_id" "dubbing"
print_artifacts "$burn_id" "burn"

log "Smoke flow complete 🎬"
