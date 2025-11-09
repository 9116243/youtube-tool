#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3001/v1}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

printf '[selftest] Base URL: %s\n' "$BASE"

python - <<'PY' "$TMP_DIR/sample.wav"
import base64, sys, pathlib
data = base64.b64decode("UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAAAA")
pathlib.Path(sys.argv[1]).write_bytes(data)
PY

python - <<'PY' "$TMP_DIR/sample.mp4"
import base64, sys, pathlib
data = base64.b64decode("AAAAHGZ0eXBpc29tAAAAAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAIABtZGF0AAACrAAAACBoZWFkAAAAHgAAABQAAABIAAAAAQAAAFQAAAAyAAAAFgAAABoAAAAwAAAAKgAAAC4AAABfZGF0YQAAAAE=")
pathlib.Path(sys.argv[1]).write_bytes(data)
PY

EMAIL="selftest+$(date +%s%N)@codex.local"
PASSWORD="Passw0rd!123!"

REGISTER_RESPONSE="$(curl -sS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
TOKEN="$(printf '%s' "$REGISTER_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const json=JSON.parse(d);if(!json.token){process.exit(1);}console.log(json.token);});")"
ORG_ID="$(printf '%s' "$REGISTER_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const json=JSON.parse(d);const org=json.organizations?.[0]?.organizationId;if(!org){process.exit(1);}console.log(org);});")"

AUTH_HEADERS=(-H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG_ID")

printf '[selftest] Uploading sample WAV\n'
AUDIO_UPLOAD="$(curl -sS -X POST "$BASE/uploads" "${AUTH_HEADERS[@]}" -F "file=@$TMP_DIR/sample.wav")"
AUDIO_PATH="$(printf '%s' "$AUDIO_UPLOAD" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const json=JSON.parse(d);console.log(json.storage.path);});")"

printf '[selftest] Uploading sample MP4\n'
VIDEO_UPLOAD="$(curl -sS -X POST "$BASE/uploads" "${AUTH_HEADERS[@]}" -F "file=@$TMP_DIR/sample.mp4")"
VIDEO_PATH="$(printf '%s' "$VIDEO_UPLOAD" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const json=JSON.parse(d);console.log(json.storage.path);});")"

cat > "$TMP_DIR/pipeline.yaml" <<YAML
stages:
  - id: sub
    title: SelfTest Subtitle
    params:
      kind: subtitle
      language: en-US
      inputAudio: "$AUDIO_PATH"
  - id: dub
    title: SelfTest Dub
    dependsOn: [sub]
    params:
      kind: dubbing
      provider: mock
      language: en-US
      inputSubtitle:
        from: sub
        artifact: srt
  - id: burn
    title: SelfTest Burn
    dependsOn: [sub, dub]
    params:
      kind: burn
      inputVideo: "$VIDEO_PATH"
      inputAudio:
        from: dub
        artifact: tts_wav
      inputSubtitle:
        from: sub
        artifact: srt
      preset: 1080p:h264:auto
YAML

PIPELINE_PAYLOAD="$(python - <<'PY' "$TMP_DIR/pipeline.yaml"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    text = fh.read()
print(json.dumps({"template": text}))
PY
)"

printf '[selftest] Running pipeline template\n'
PIPELINE_RESPONSE="$(curl -sS -X POST "$BASE/pipeline/run" "${AUTH_HEADERS[@]}" -H 'Content-Type: application/json' -d "$PIPELINE_PAYLOAD")"
BURN_TASK_ID="$(printf '%s' "$PIPELINE_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const json=JSON.parse(d);const burn=json.created.find((s)=>s.stageId==='burn');if(!burn){process.exit(1);}console.log(burn.taskId);});")"

printf '[selftest] Waiting for burn task %s\n' "$BURN_TASK_ID"
for attempt in $(seq 1 120); do
  TASK_RESP="$(curl -sS -X GET "$BASE/tasks/$BURN_TASK_ID" "${AUTH_HEADERS[@]}")"
  STATUS="$(printf '%s' "$TASK_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const json=JSON.parse(d);console.log(json.status);});")"
  if [[ "$STATUS" == "success" ]]; then
    break
  fi
  if [[ "$STATUS" == "failed" || "$STATUS" == "cancelled" ]]; then
    printf 'Task ended with status %s\n' "$STATUS" >&2
    exit 1
  fi
  sleep 2
done

ARTIFACT_FILE="workspace/$BURN_TASK_ID/artifacts.json"
if [[ ! -f "$ARTIFACT_FILE" ]]; then
  echo "Artifacts file missing at $ARTIFACT_FILE" >&2
  exit 1
fi

node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!data.artifacts || !data.artifacts.video){process.exit(1);}else{process.exit(0);}" "$ARTIFACT_FILE"

echo "PASS"
