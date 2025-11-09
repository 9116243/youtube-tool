## server_v2 Backend (Flagship Edition)

The flagship backend stitches together the subtitle → dubbing → burn workflow, exposes observability endpoints, and keeps the developer ergonomics of a single-process mock runner while allowing upgrades (Redis queues, forked workers, S3 blobs, Postgres, etc.). Use this doc as the 10‑minute onboarding kit.

### Architecture at a Glance

```mermaid
flowchart LR
  FE[Desktop / Web App] -->|REST + SSE| API((Express API))
  API -->|JWT Auth| Auth[(Prisma Users)]
  API -->|Task CRUD| Queue[(Task Queue<br/>memory or redis)]
  Queue --> Worker[(Inline Runner<br/>or forked workers)]
  Worker -->|Artifacts| Storage[(Local FS or S3)]
  Worker -->|Metrics| Prom[prom-client]
  API --> SSE[(EventSource /events)]
  API --> Metrics[/metrics/]
  API --> Docs[/openapi.json/]
```

### Getting Started

```bash
cd server_v2
npm install
npm run prisma:gen
npm run prisma:push
cp .env.example .env   # Windows: copy .env.example .env
npm run dev
```

Frontend integration (e.g. Vite) usually needs:

```
VITE_API_BASE=http://localhost:3001
VITE_SSE_URL=http://localhost:3001/events
```

### Environment Reference

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3001` |
| `CORS_ORIGIN` | Allowed origin for cookies/SSE | `http://localhost:5173` |
| `JWT_SECRET`, `JWT_EXPIRES` | Auth tokens | `replace-me`, `7d` |
| `ORG_DEFAULT_NAME`, `API_KEY_PREFIX` | First org name + API key prefix | `Default Organization`, `ytb_` |
| `DATABASE_URL` | Prisma URL (SQLite by default) | `file:./data/youtube-tool.db` |
| `WORK_DIR` | Workspace root for artifacts/uploads | `./workspace` |
| `TRUST_PROXY` | Express `trust proxy` setting (`loopback`, `true`, IP list) | `loopback` |
| `WORKER_MODE` | `inline` (single process) or `fork` (spawn `QUEUE_CONCURRENCY` child workers) | `inline` |
| `QUEUE_DRIVER` | `memory` (dev/demo) or `redis` (required for `fork` mode / multi-host runners) | `memory` |
| `QUEUE_CONCURRENCY` | Number of forked worker processes when `WORKER_MODE=fork` | `2` |
| `QUEUE_MAX_RETRIES` | Max attempts per task before it lands in the dead-letter queue | `3` |
| `QUEUE_RETRY_BASE_MS`, `QUEUE_RETRY_MAX_MS` | Exponential retry backoff range for worker crashes/step failures | `1000 / 30000` |
| `WEBHOOK_RETRY_MAX` | Attempts per webhook delivery before it is marked failed | `5` |
| `BLOB_BACKEND` | `local` or `s3` | `local` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` | S3/MinIO credentials + addressing mode for presigned uploads/downloads | _empty_ / `_false_` |
| `RATE_LIMIT_WINDOW`, `RATE_LIMIT_PER_ORG` | Per-org throttling window + burst | `60s / 300 req` |
| `LOUDNESS_*`, `VMAF_MIN`, `RENDER_RETRY_MAX` | Burn-quality knobs | see `.env.example` |
| `DEFAULT_RENDER_PRESET` | Render preset shorthand `resolution:codec:hardware` | `2160p:h264:auto` |
| `GEN_MOCK_MIN_MS`, `GEN_MOCK_MAX_MS` | Override mock video generator duration window (ms) | `30000 / 90000` (default when unset) |
| `RUNWAY_API_KEY`, `RUNWAY_API_BASE` | Runway Gen-3 API credentials | _(empty)_, `https://api.runwayml.com` |
| `RUNWAY_PRICE_PER_MIN_FLASH`, `RUNWAY_PRICE_PER_MIN_ALPHA` | USD/min inputs for Flash/Alpha billing (used for metrics) | `0 / 0` |
| `RUNWAY_MAX_CONCURRENCY` | Max concurrent Runway API requests | `4` |
| `LUMA_API_KEY`, `LUMA_API_BASE` | Luma (Dream Machine) API credentials | _(empty)_, `https://api.luma.ai` |
| `LUMA_PRICE_PER_MIN_1080`, `LUMA_PRICE_PER_MIN_2K`, `LUMA_PRICE_PER_MIN_4K` | USD/min knobs per resolution for cost attribution | `0 / 0 / 0` |
| `LUMA_MAX_CONCURRENCY` | Max concurrent Luma API requests | `2` |
| `HAIPER_API_KEY`, `HAIPER_API_BASE` | Haiper API credentials | _(empty)_, `https://api.haiper.ai` |
| `HAIPER_PRICE_PER_MIN_1080` | USD/min baseline for Haiper cost attribution | `0` |
| `HAIPER_MAX_CONCURRENCY` | Max concurrent Haiper API requests | `6` |
| `REPLICATE_API_TOKEN`, `REPLICATE_API_BASE` | Replicate API credentials | _(empty)_, `https://api.replicate.com` |
| `REPLICATE_MAX_CONCURRENCY` | Max concurrent Replicate predictions | `3` |
| `DOMOAI_API_KEY`, `DOMOAI_API_BASE` | DomoAI effect API credentials | _(empty)_, `https://api.domo.ai` |
| `DOMOAI_PRICE_PER_MIN_EFFECT` | USD/min baseline for DomoAI effect jobs | `0` |
| `DOMOAI_MAX_CONCURRENCY` | Max concurrent DomoAI requests | `4` |
| `QC_ENABLE` | Enable post-generation video QC | `false` |
| `GEN_QUOTA_MIN_PER_DAY`, `GEN_QUOTA_CONCURRENCY` | Daily `gen_video` minute cap + concurrent slot count per org | `120 / 2` |
| `ASR_PROVIDER`, `TTS_PROVIDER` | Default transcription / speech engines (`mock`, `openai`, `elevenlabs`, `azure`) | `mock` |
| `OPENAI_API_KEY`, `ELEVEN_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `TTS_SAMPLE_RATE` | Speech vendor credentials + defaults | _empty_ / _empty_ / _empty_ / `EXAVITQu4vr4xnSDxMaL` / _empty_ / _empty_ / `22050` |
| `PIPELINE_MAX_STAGES` | Safety cap for templated pipelines | `30` |
| `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_*` | Structured logs + OTLP target and sampler | `info`, `http://localhost:4318`, `parentbased_traceidratio@0.2` |
| `WORKSPACE_TMP_TTL_HOURS` | TTL for workspace scratch files (artifacts stay forever) | `24` |

> Tip: every option in `.env.example` has sane defaults so the project runs without Redis, S3, or Postgres. Flip the switches only when the infra is ready.

### Generation quotas & billing

- `gen_video` tasks accrue **billed minutes/cents** once artifacts pass QC. The `generations` table stores `pricePerMinCents`, `billedMinutes`, `billedCents`, and every fallback/violation/overage lands in `generation_audit`.
- Daily caps come from `GEN_QUOTA_MIN_PER_DAY` (minutes) and `GEN_QUOTA_CONCURRENCY` (parallel jobs). When a tenant exceeds either limit the API responds with `429 QUOTA_EXCEEDED`, the generation row is marked `rejected_quota`, and an audit entry explains the reason.
- `GET /v1/billing/usage` now emits a `generations` block alongside tasks/render/storage stats:

```json
{
  "generations": {
    "minutesUsed": 8,
    "limit": 120,
    "concurrencyLimit": 2,
    "costCents": 240
  }
}
```

### License & publishing guardrails

- Each generation writes `license.json` inside `WORK_DIR/<taskId>/` capturing `{ provider, plan, watermark, redistributable, commercial_use, attribution, tos_url }`.
- `POST /v1/publish/youtube/schedule` refuses to queue videos whose license demands watermarks or forbids commercial use, returning `409 GEN_LICENSE_BLOCK`, emitting `publish.license_block` audit logs, and incrementing `gen_license_block_total{provider,reason}`. The publisher worker double-checks at runtime to prevent bypasses.

### Worker Modes

- **Inline (default)** &mdash; single process that polls the in-memory queue. Ideal for laptops or quick demos. Just run `npm run dev`.
- **Forked** &mdash; set `QUEUE_DRIVER=redis`, `WORKER_MODE=fork`, and optionally bump `QUEUE_CONCURRENCY`. The API spawns that many child workers, restarts them on crashes (exponential backoff, max five attempts), and forwards metrics/SSE so the UI keeps working.
- Example `.env` toggle:

  ```
  QUEUE_DRIVER=redis
  REDIS_URL=redis://127.0.0.1:6379
  WORKER_MODE=fork
  QUEUE_CONCURRENCY=4
  ```

  Then start the API normally with `npm run dev`; the worker pool is supervised automatically.

### Multi-tenant & RBAC

- Every user owns at least one **Organization**. Switch orgs by sending `X-Org-Id` together with your `Authorization: Bearer <token>`.
- Membership roles (`OWNER | ADMIN | EDITOR | VIEWER`) enforce route-level ACLs via `src/middleware/rbac.ts`. EDITORs can create tasks/uploads, ADMINs/OWNERS can manage pipeline/publish/org settings.
- Machine-to-machine access uses **Service Accounts + API Keys**. Create them via `POST /apikeys`, copy the plaintext once, and authenticate with `X-Api-Key`.
- All sensitive mutations (tasks, pipeline submissions, uploads, org/member changes, API keys, publish schedules) emit rows in `AuditLog` so SOC teams can trace who did what.
- Rate limiting now keys on `orgId` first, then falls back to user/service/IP, so noisy tenants can't starve others.

### Observability

- OpenTelemetry Node SDK ships with HTTP/Express/Prisma auto-instrumentation and exports traces via OTLP/HTTP. Point `OTEL_EXPORTER_OTLP_ENDPOINT` at your collector, adjust the sampler with `OTEL_TRACES_*`, and you'll see `/healthz`/task traces end-to-end.
- Every request receives/returns an `x-request-id`, log lines (Pino) automatically include `requestId`, `traceId`, `spanId`, `orgId`, `userId`, and SSE payloads now surface `meta.traceId` so the UI can correlate real-time events with backend traces.

### Feature Flags

- Flags live in `FeatureFlag` (key + org overrides) with a 60s in-memory cache. Toggle them via `/v1/admin/flags/*`; every mutation automatically invalidates the cache but you can force refresh with `POST /v1/admin/flags/{key}/invalidate`.
- Built-in keys:
  - `feature.mab` &rarr; gates the multi-armed-bandit endpoints (`/ab/*`).
  - `quality.strict_burn` &rarr; enforces VMAF retries for burn renders (defaults to `true`).
  - `publish.dry_run` &rarr; overrides `DRY_RUN` per org for the YouTube publisher (defaults to env value).
- Examples:

```bash
curl -s -X GET http://localhost:3001/v1/admin/flags \
  -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>"

curl -s -X POST http://localhost:3001/v1/admin/flags \
  -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>" \
  -H "Content-Type: application/json" \
  -d '{"key":"publish.dry_run","defaultValue":true}'

curl -s -X POST http://localhost:3001/v1/admin/flags/publish.dry_run/overrides \
 -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"<org>","value":false}'
```

### Speech Providers & Caching

- `ASR_PROVIDER` (`mock`, `openai`) and `TTS_PROVIDER` (`mock`, `elevenlabs`, `azure`) control which engines every task uses by default. Populate the matching env vars (`OPENAI_API_KEY`, `ELEVEN_API_KEY`/`ELEVENLABS_API_KEY`, `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`, etc.) when you want the real services instead of the offline mocks.
- Results are cached under `workspace/.cache/asr` and `workspace/.cache/tts` using a SHA256 signature of the input media/text + provider + language/voice. Cache hits return instantly and mark `cacheHit=true` inside artifact metadata and SSE payloads.
- Override providers per task with `params.provider`. Supply a string to change both engines (`"openai"` or `"elevenlabs"`), or target one pipeline via an object:

  ```json
  {
    "title": "Subtitle via Whisper",
    "params": {
      "kind": "subtitle",
      "language": "en-US",
      "provider": { "asr": "openai" },
      "inputAudio": "storage://uploads/demo.wav"
    }
  }
  ```

  ```json
  {
    "title": "Dub from subtitles",
    "params": {
      "kind": "dubbing",
      "provider": { "tts": "elevenlabs" },
      "voiceId": "EXAVITQu4vr4xnSDxMaL",
      "inputSubtitle": { "from": "$SUB", "artifact": "srt" }
    }
  }
  ```

- The TTS step accepts either inline text (`params.text` / `params.script`) or an upstream subtitle artifact (`inputSubtitle`)—the backend flattens SRT to prose before calling the provider.
- Artifact metadata now records provider name, voice, cache hit state, duration, sample rate, and ASR segment counts so QA tooling can reason about output quality without reprocessing the media.

### 生成链路概览

- `kind: "gen_video"` 任务由生成编排器托管：写入 `generations` / `generation_events` / `generation_assets`，在 mock / Runway / Luma / Haiper 之间选择适配器，并通过 SSE 输出 `phase="GEN"`、`step∈{prepare,generate,upscale,compose,complete}` 的实时进度。
- `providerPolicy="force:runway"` / `force:luma` / `force:haiper` / `force:replicate[:model]` 可定向供应商；未指定时 `best_quality → Runway`、`balanced → Luma`、`lowest_cost → Haiper`（不可用则回落到 mock）。Runway 会在 Flash 与 Alpha 间切换且遵守 `RUNWAY_MAX_CONCURRENCY` 并对 429/5xx 退避；Haiper 使用 `HAIPER_MAX_CONCURRENCY`，失败时记录 “supports cross-vendor fallback”；Replicate 通过 `force:replicate`（可附 `owner/model%3Aversion`）调用支持 AnimateDiff/SVD/Depth-Flow 等模型，并把原始响应写入 `metadata.providerRaw`。
- Mock 适配器默认模拟 30~90 秒的出片时间，方便前端/运营观察真实长周期；本地或 CI 可以通过 `GEN_MOCK_MIN_MS` / `GEN_MOCK_MAX_MS` 覆盖为更短时延。
- 所有任务都会在 `WORK_DIR/<taskId>/` 下生成 `primary.mp4`, `preview.mp4`, `cover.jpg`, `metadata.json`，并写入 `artifacts.json` + `generation_assets`，方便后续 publish、下载或分析。
- 成本会根据供应商单价（`RUNWAY_PRICE_PER_MIN_*`、`LUMA_PRICE_PER_MIN_*`、`HAIPER_PRICE_PER_MIN_1080`）折算到 `generations.costCents`，并通过 `generation_cost_cents_total{provider,policy}` 暴露给 Prometheus，便于预算/告警。
- 可选的 `gen_effect` 任务会针对现有 `primary.mp4` 执行 DomoAI zoom/reframe/kenburns 变体生成，产出 `variants/variant-001/primary.mp4` 与封面，并把条目写入 `metadata.variants[]`，成本按 `DOMOAI_PRICE_PER_MIN_EFFECT` 计入。
验证

```bash
TOKEN=...
ORG_ID=...
curl -s -X POST http://localhost:3001/v1/tasks \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Gen mock demo",
        "params":{
          "kind":"gen_video",
          "prompt":"A neon skyline with cinematic camera moves",
          "duration":10,
          "resolution":"1080p",
          "aspect":"16:9",
          "providerPolicy":"balanced"
        }
      }'

# 观察 /events?taskId=... SSE，phase=GEN
# 完成后检查 workspace/<taskId>/primary.mp4 等文件，以及 prisma generation(s) 记录
```

### Storage & Presigned Uploads

- Set `BLOB_BACKEND=s3` (and populate the `S3_*` credentials above) to offload large uploads and finished artifacts to MinIO/S3. The API always stores a `storage://` URI so tasks resolve inputs the same way regardless of backend.
- `POST /uploads/presign` issues a short-lived PUT URL so the browser can stream directly to S3; the backend only records the metadata and later validates via `/files/:taskId/:artifact`.

```bash
curl -s -X POST http://localhost:3001/v1/uploads/presign \
  -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>" \
  -H "Content-Type: application/json" \
  -d '{"filename":"demo.mov","contentType":"video/quicktime","size":67108864}'
```

- A daily lifecycle cron (`src/cron/lifecycle.ts`) prunes workspace scratch files older than `WORKSPACE_TMP_TTL_HOURS`, leaving `artifacts.json` + any files referenced by artifacts intact. This prevents `workspace/` from ballooning while keeping reproducible outputs.

### Usage & Quotas

- Daily budgets are configurable via `QUOTA_TASKS_PER_DAY` and `QUOTA_RENDER_MIN_PER_DAY`; long-term storage is capped by `QUOTA_STORAGE_GB`. Breaches return `429 ERR_QUOTA`.
- Prometheus surfaces `usage_tasks_total{orgId}`, `usage_minutes_total{orgId}`, and `usage_storage_bytes{orgId}` so you can page on aggressive tenants.
- Use `GET /v1/billing/usage` (ADMIN+) for a JSON snapshot:

```bash
curl -s http://localhost:3001/v1/billing/usage \
  -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>"
```

- Storage usage mirrors the sum of `uploads.size`; deleting or moving rows frees quota immediately.

### Uploads & Files

- `POST /v1/uploads` still accepts multipart uploads (hash + size returned). Every file is stored under `storage://uploads/<id>/<filename>` so task artifacts and uploads share one URI scheme.
- When `BLOB_BACKEND=s3` is set alongside `S3_BUCKET`/`S3_REGION` (and optional `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), call `POST /v1/uploads/presign` to obtain `{ uploadUrl, method, finalPath }`. The browser can `PUT` directly to S3 and then reuse `finalPath` as any task input.
- Artifacts now record storage URIs plus `sha256` in `artifacts.json`. Use `GET /v1/files/{taskId}/{artifact}` to stream (supports `Range` headers). Traffic is exported via `storage_upload_bytes_total{orgId}` and `storage_download_bytes_total{orgId}`.
- Whenever a storage URI is referenced as task input (e.g., `storage://uploads/...`), the runner materializes it locally—no extra glue code is needed in templates or pipeline configs.

### API Versioning

- All stable endpoints live under `/v1/*`. Legacy paths without the prefix are still mounted but respond with the `Deprecation: true` and `Sunset` headers so you can plan your cutover.
- The OpenAPI document (`GET /v1/openapi.json`) and the self-test scripts already target `/v1`. Update SDK/base URLs to match; the compat layer will be removed after the published sunset date.

### Render Quality

- Audio tracks are optionally normalized up front via ffmpeg’s `loudnorm` filter (target `LOUDNESS_TARGET_LUFS`, range `LOUDNESS_RANGE`). Post-render we measure the final mux and emit `render_loudness_lufs` plus per-artifact metadata so you can spot mixes that drift.
- When ffmpeg ships with `libvmaf`, every burn compares against the source input. If the mean VMAF falls below `VMAF_MIN`, we automatically boost bitrate/adjust CRF and re-render once (bounded by `RENDER_RETRY_MAX`) before failing the task. Each re-attempt increments `render_retry_total`.
- Successful renders push VMAF/LUFS values into Prometheus (`render_vmaf_score`, `render_loudness_lufs`) and store them in `artifacts.json`, so QA dashboards and downstream automation can enforce thresholds consistently.
- The burn pipeline now consumes real inputs via `params.inputVideo` + `params.inputSubtitle` and exposes knobs for `resolution` (`1080p|1440p|2160p|source`), `bitrate` (kbps), optional `watermark` (`{path, opacity, position}`), and `hwaccel` (`auto|none`). Output lands at `workspace/<taskId>/out.mp4`, and progress events surface `burn_init → burn_transcode → burn_post` while ffmpeg reports its ETA.

### Webhooks

- Provide `params.webhookUrl` when creating a task to be notified whenever it reaches `success`, `failed`, or `cancelled`. Optionally add `params.webhookSecret` to override the shared `KMS_SECRET` for that task.
- Payload:

```json
{
  "id": "task_cuid",
  "status": "success",
  "orgId": "org_cuid",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "artifacts": { "video": { "name": "video", "path": "workspace/task/artifacts.mp4" } },
  "metrics": { "vmaf": 95.5, "loudness": -13.8 }
}
```

- Each body is signed with `HMAC-SHA256(secret, payload)` and surfaced via the `X-Sig` header (legacy `X-Signature` is also sent for compatibility). If `webhookSecret` is omitted we fall back to `KMS_SECRET`. Verify with:

```ts
import crypto from 'node:crypto';

const signature = req.header('x-sig') ?? '';
const digest = crypto.createHmac('sha256', process.env.KMS_SECRET!).update(rawBody).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(digest, 'hex'))) {
  throw new Error('Invalid signature');
}
```

- Deliveries retry up to 3 times with exponential backoff—watch server logs for `Webhook delivery failed` if the collector is offline. Task events `webhook.success` / `webhook.failed` are stored for audit.

### Notifications & Alerts

- Configure SMTP/Slack/Feishu credentials via env vars and, optionally, create a `NotificationRule` record per org to override the default channel/event mapping. By default failed tasks hit every available channel, completed tasks go to chat-only, and threshold alerts (fail rate, queue depth) target all channels.
- Use `/admin` privileges to monitor dead letters (`/admin/deadletters`) and stream task events (`/admin/events?format=csv|ndjson`). Replay and purge actions are RBAC-guarded and emit Prometheus counters (`deadletter_replayed_total`, `deadletter_purged_total`).

### YouTube Publisher

- Admins bind a channel with `GET /oauth/google/init` → Google consent → `/oauth/google/callback`, which stores encrypted refresh/access tokens (AES-GCM via `KMS_SECRET`).
- Editors schedule uploads via `POST /publish/youtube/schedule` (artifact path or `{ taskId, artifactName }`), inspect with `GET /publish/jobs`, and tweak via `PATCH /publish/jobs/:id`.
- `DRY_RUN=true` simulates publishing (notes reflect the dry run) so you can test without valid OAuth credentials; flip it to `false` once `GOOGLE_CLIENT_ID/SECRET` are wired and the background worker can hit YouTube v3.

### Upload Hardening

- `/uploads` now enforces a strict allowlist (`ALLOWED_MIME`) and magic-number verification via `file-type`; spoofed/unknown types return **415**. Files larger than `MAX_UPLOAD_MB` short-circuit with **413** before any processing.
- Every upload is scanned through ClamAV (when `CLAMAV_HOST/PORT` reachable). Positive detections are written to `QUARANTINE_DIR`, logged/audited with the file hash, and reported as **422**. Scanner failures respond with **503** to avoid blindly accepting unscanned files.
- Metrics (`uploads_accepted_total`, `uploads_rejected_total`, `uploads_quarantined_total`) expose acceptance ratios, while audit logs capture IP, UA, SHA256, and rejection reasons so SOC can trace abuse attempts.

### One-Command Smoke Flows

| Command | Description |
| --- | --- |
| `npm run smoke:ps` | Windows PowerShell script that creates subtitle → dubbing → burn tasks, tails `/events`, waits for completion, then prints each task’s `workspace/<taskId>/artifacts.json`. |
| `npm run smoke:sh` | Bash equivalent for WSL/macOS/Linux. |
| `pwsh scripts/selftest.ps1` / `bash scripts/selftest.sh` | Upload sample media → run `/pipeline/run` template (subtitle→dubbing→burn) → wait for completion → verify `artifacts.json` contains the rendered video. |

### Validation

```
# Health
curl -s http://localhost:3001/healthz

# Presign upload (requires S3 backend)
curl -s -X POST http://localhost:3001/uploads/presign \
 -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>" \
 -H "Content-Type: application/json" \
 -d '{"filename":"demo.wav","contentType":"audio/wav","size":12345}'

# Pipeline template trigger
curl -s -X POST http://localhost:3001/pipeline/run \
 -H "Authorization: Bearer <token>" -H "X-Org-Id: <org>" \
 -H "Content-Type: application/json" \
 -d '{"stages":[{"title":"sub","params":{"kind":"subtitle","language":"en-US","inputAudio":"storage://uploads/..."}},{"title":"dub","dependsOn":["sub"],"params":{"kind":"dubbing","language":"en-US","inputSubtitle":{"from":"$SUB","artifact":"srt"}}},{"title":"burn","dependsOn":["sub","dub"],"params":{"kind":"burn","inputVideo":"storage://uploads/...","inputAudio":{"from":"$DUB","artifact":"tts_wav"},"inputSubtitle":{"from":"$SUB","artifact":"srt"},"preset":"2160p:h264:auto"}}]}'
```

### Testing

- `npm test` runs Vitest + Supertest against `/v1/*`. It truncates the local SQLite database between tests, so run it against disposable data (or copy `data/youtube-tool.db` beforehand).
- CI executes the same suite plus `npm run build`, so regressions surface before a merge hits `main`.

### Containers

```bash
docker compose up -d      # start API + Redis + Postgres + MinIO + ClamAV + OTEL + Grafana
docker compose logs -f api
```

- The `Dockerfile` builds a production Node 20 image (`dist/server.js`). Adjust the environment variables in `docker-compose.yml` to point at real infrastructure (S3/SMTP credentials, alert thresholds, etc.).
- Grafana (http://localhost:3000, admin/admin) and the OTEL collector give you dashboards without wiring external APM tooling.

Both smoke scripts accept `BASE`, `WORK_DIR`, `EVENT_TIMEOUT`, `POLL_INTERVAL` overrides via env vars so you can point them at staging appliances.

### Pipeline Example (subtitle → dubbing → burn)

`POST /pipeline/run` consumes JSON or YAML templates (wrap YAML in `{ "template": "<yaml>" }`) and atomically expands them into tasks. Stage `id`s get replaced with the created task IDs so downstream `from` references and `dependsOn` edges just work.

```yaml
stages:
  - id: sub
    title: Subtitle
    params:
      kind: subtitle
      language: en-US
      inputAudio: storage://uploads/demo.wav
  - id: dub
    title: Dub
    dependsOn: [sub]
    params:
      kind: dubbing
      language: en-US
      provider: mock
      inputSubtitle:
        from: sub
        artifact: srt
  - id: burn
    title: Burn
    dependsOn: [sub, dub]
    params:
      kind: burn
      inputVideo: storage://uploads/demo.mp4
      inputAudio:
        from: dub
        artifact: tts_wav
      inputSubtitle:
        from: sub
        artifact: srt
      preset: 1080p:h264:auto
```

The response returns `stageId → taskId` pairs so you can poll `/tasks/:id` or stream `/events?taskId=...` for each stage. `PIPELINE_MAX_STAGES` caps template size (default 30) to keep things predictable.

### API Surface & OpenAPI

- Key endpoints: `/auth/*`, `/orgs*`, `/apikeys*`, `/tasks`, `/tasks/:id`, `/tasks/:id {PATCH}`, `/pipeline/submit`, `/pipeline/run`, `/events`, `/ai/titles`, `/publish/*`, `/uploads`, `/metrics`, `/healthz`.
- A machine-readable spec is served at **`GET /openapi.json`** (importable in Postman/Insomnia, or viewed in ReDoc/Swagger UI). The spec lists request/response schemas plus which routes need `Authorization: Bearer <JWT>`.
- SSE (`/events?taskId=...`) is unauthenticated for local dev but still respects JWT headers if you want to harden it.

### Metrics & Alerting Hooks

- `GET /metrics` emits Prometheus text with task counters, queue gauges, duration summaries, and the new `render_vmaf_score`, `render_loudness_lufs`, `render_retry_total`.
- Health data (`/healthz`) includes DB + queue snapshots so uptime robots can alert on degraded states.
- Quality telemetry is also mirrored to SSE payloads (`metrics.vmaf`, `metrics.loudness`, `metrics.renderAttempts`) so frontends can visualize renders in real time.

### FAQ / Troubleshooting

- **SSE / proxy timeouts** – bypass corporate proxies for `/events` (`curl --noproxy localhost ...`) or configure nginx with `proxy_buffering off` and generous `proxy_read_timeout`.
- **Custom fonts in burn** – update `renderBurn` subtitle filter to point at your `.ttf` (e.g. `subtitles=...:force_style='FontName=Inter'`) or copy fonts into the FFmpeg container.
- **Fonts look jagged in generated video** – ensure your ffmpeg build has libfreetype; otherwise subtitles fall back to default fonts.
- **Prisma “database is locked” errors** – remove `data/*.db-journal`, ensure no second process is running migrations, then retry `npm run prisma:push`.
- **Task never starts** – confirm dependencies succeeded (`dependsOn` will stall if any upstream failed). Use `/tasks?status=queued,running` and `/events`.
- **SSE logs show 403** – double-check `CORS_ORIGIN` when testing from a different host and forward the `Authorization` header if you turned on SSE auth.

### Migration Recipes

- **SQLite �� Postgres**
  1. Provision a Postgres instance, grab the connection string.
  2. Update `DATABASE_URL` (e.g. `postgresql://user:pass@host:5432/db?schema=public`).
  3. Run `npm run prisma:push` (or `prisma migrate deploy` for prod) and restart the API.

- **Memory queue �� Redis**
  1. Deploy Redis and set `REDIS_URL=redis://...`.
  2. Flip `QUEUE_DRIVER=redis` (durable queue, retry visibility, dead-letter polling).
  3. Restart the API; pending tasks are replayed automatically and multiple workers can now cooperate.

- **Local artifacts �� S3**
  1. Set `BLOB_BACKEND=s3` and supply `S3_BUCKET`, `S3_REGION`, credentials, and optional endpoint (for MinIO).
  2. Implement the remaining S3 adapter hooks under `src/adapters/storage/s3-storage.ts`.
  3. Re-run smoke tests to confirm uploads and task artifacts land in the bucket.

- **Inline �� forked workers**
  - Set `QUEUE_DRIVER=redis` (shared queue) and `WORKER_MODE=fork`.
  - Tune `QUEUE_CONCURRENCY` (number of child processes) and `CONCURRENCY` (parallel tasks per child).
  - The API supervises the worker pool: crashes restart with exponential backoff (max five retries) and `SIGINT`/`SIGTERM` gracefully drain each child. Leave `WORKER_MODE=inline` when Redis is unavailable.

### Extending the Runner

`src/tasks/runner.ts` ships with mocked ASR/TTS/BURN steps so the entire pipeline works offline. Swap each step with real services (Whisper, ElevenLabs, FFmpeg-in-docker, etc.) and continue writing artifacts through `tasks/artifacts.ts`—the smoke scripts plus `/openapi.json` will keep the contract honest.




### QC

- Set `QC_ENABLE=true` to enforce black/freeze/loudness/bitrate checks on every `gen_video` artifact. Fixable issues (loudness/bitrate/container) are auto-repaired via ffmpeg, and results land in `metadata.qc`. Unfixable issues raise `GEN_QC_FAIL` so the router falls back to another provider once.
