# Enterprise YouTube Suite

Enterprise-grade operations console for managing AI-assisted YouTube workflows. The client is built with React, Vite, Tailwind CSS, shadcn/ui, Zustand, and Framer Motion, while mock APIs are provided via a lightweight Node SSE server.
## Highlights

- Template Manager dialog captures render profiles, supports versioning, and can push presets to active queue jobs.
- Subtitle toolkit adds multi-language track uploads, burn-in styling controls, and contextual warnings tied to hardware capabilities.
- Queue panel now visualises segment progress, surfaces VRAM/time estimates, and offers one-click retries for failed segments.
- Download center cards expose resolution/codec/HDR filters, richer metadata badges, and preview/storyboard tooling linked to completed tasks.
## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Launch the mock API (REST + SSE)**
   ```bash
   npm run mock:server
   ```
3. **Start the Vite dev server** (the UI expects the mock API on port 4000)
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` and exercise all pages: workflow builder, downloads, settings, and admin.
5. Optional: run a type sweep before commits.
   ```bash
   npm run typecheck
   ```
## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check then create a production bundle |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint (with import/order) against `src` |
| `npm run format` | Prettier write-mode for supported extensions |
| `npm run typecheck` | Strict TypeScript compilation with no emit |
| `npm run mock:server` | Start the Node REST + SSE mock backend |
## Environment Variables

Duplicate `.env.example` to `.env.local` when pointing at a real backend. Recognised keys:

| Key | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | `http://localhost:4000/api` | REST + SSE endpoint for queue, downloads, and progress events |
| `VITE_ELEVEN_API_KEY` | - | Enables voice listing within the mock TTS selector (optional) |

When the variable is omitted the client falls back to the local mock server.
## Hardware Acceleration Matrix

| Encoder | Hardware | Notes |
| --- | --- | --- |
| `h264_nvenc`, `hevc_nvenc`, `av1_nvenc` | NVIDIA NVENC (Turing+) | Fastest option; prefers recent Studio drivers |
| `h264_qsv`, `hevc_qsv` | Intel Quick Sync | Available on most 11th-gen+ mobile and desktop iGPUs |
| `hevc_amf` | AMD AMF | Ensure Adrenalin 24.x or newer for HEVC HDR |
| `h264`, `hevc`, `av1` | CPU encoders (libx264/x265/libaom) | Highest quality but slow; avoid for >1080p unless rendering on a farm |

### Analysis Resolution vs. Output
Scene analysis runs on a reduced resolution (`360p`, `480p`, or `720p`) to keep detection responsive. The final output resolution remains independent, so you can analyse at `360p` for speed while delivering a `2160p` master. Adjust the bitrate, encoder, and upscale modes in the expert panel to match your delivery requirements.
## Mock API & SSE

The `mock/server.js` process exposes:

- `POST /api/tasks` - registers a render job and streams SSE progress
- `GET /api/tasks` / `GET /api/tasks/:id` - list and inspect tasks
- `GET /api/sse/progress?taskId=...` - progress stream emitting 3-7% increments until 100%

For the production Express backend (authentication, SSE heartbeat guidance, `/metrics`, etc.) see [docs/api-sse.md](docs/api-sse.md).

`src/lib/api.ts` logs the derived ffmpeg arguments (via `buildFfmpegArgs`) so you can cross-check encoder profiles during development.
## FAQ

### The queue progress does not advance
Ensure the mock server is running (`npm run mock:server`). The UI listens to `http://localhost:4000/api/sse/progress` by default.

### Bitrate shows `auto`
Selecting `auto` defers to the preset or the recommended range for the chosen output resolution. Switch to a numeric value if you need a fixed target.

### HDR metadata fields are greyed out
Set HDR mode to `PQ` or `HLG` first, then expand the HDR metadata panel to populate mastering display and MaxCLL/FALL values.

### Desktop packaging?
See [docs/desktop.md](docs/desktop.md) for Tauri pinning, Electron alternatives, and icon placement guidance.

### SSE stops updating when the tab is idle
Most browsers throttle background tabs. Use the built-in heartbeat in this project or disable throttling via DevTools (`Rendering` > `Disable throttling`). Keeping the mock server console focused also prevents the connection from being suspended.

### Estimated render time feels inaccurate
The estimator multiplies shot count, resolution, encoder type, tone mapping, audio processing, and HDR penalties. If your real hardware is faster/slower than the mock profile, adjust the coefficients in `features/workflow/calc.ts` to calibrate.

### How can I simulate weak or offline network conditions?
You can run `npx msw-network-latency --latency 2000` around the mock server, or use Chrome DevTools (`Network` panel) with presets like `Slow 3G`. The SSE helper retries with exponential backoff, so connection drops will surface in the UI.

---

With the mock server and Vite dev server running you should see the complete UI: workflow builder (with advanced render parameters), downloads dashboard reacting to queue completion events, settings/admin modules, and the neon shell with theme toggling.

## FFmpeg & QA quick notes

- **Sprite sheet generation:** `ffmpeg -i input.mp4 -vf fps=1/2,tile=10x10 -qscale:v 2 thumbs.jpg` then create VTT entries mapping timestamps to tile coordinates.
- **Audio loudness:** The R128 preset targets `-23 LUFS` using `loudnorm=I=-23:LRA=7:TP=-2`. Adjust the integration window if your content is shorter than 60 seconds.
- **QA towers:** Swap the mock `runQaMock` with actual VMAF by invoking `ffmpeg -i test.mp4 -i ref.mp4 -lavfi libvmaf=model_path=vmaf_v0.6.1.json` and emit the JSON into the report center.

---

## Selftest & Acceptance

1. Enable tooling: set `DEV_TOOLS=true` and (optionally) `SELFTEST_ENABLE_EXTERNAL=true` with `SELFTEST_API_KEY`.
2. Run `npm run dev` inside `server_v2` and hit `/v1/selftest` (or execute `scripts/selftest.sh` / `scripts/selftest.ps1` to hit that route automatically).
3. Expect the response to include `{"message":"SELFTEST PASS"}` plus ladder, HDR, safe-area, and lip-sync diagnostics.
4. When no external keys are configured, only the basic path runs; enabling `SELFTEST_ENABLE_EXTERNAL` triggers the extra generation/effect coverage before finally returning `SELFTEST PASS`.
5. `scripts/dev-fixtures.ts` and `scripts/dev-webhook-echo.ts` prepare dev data and a local webhook echo while `DEV_TOOLS=true`.
6. 对于 Kubernetes 集群，可参考新的 [`README-k8s.md`](README-k8s.md) 文档来配置 Helm / ArgoCD / Grafana 与 Prometheus。

## Cost & Unit Economics

1. 每 5 分钟（`COST_ROLLUP_CRON`）会将 `generation` 表按 provider/policy 聚合到 `generation_costs`，并通过 `cost_rollup_*` 指标推动 `grafana/dashboards/youtube-observability.json` 中的面板。
2. 使用 `/v1/analytics/costs?windowHours=6`、`/v1/analytics/unit-economics` 与 `/v1/analytics/sla`（需 `tasks:read` 许可）来获取实时成本、单位经济与 SLO 状态；默认窗口从 `COST_ALERT_UNIT_COST_SIGMA`、`SLO_TARGET_API`、`SLO_TARGET_GEN` 中读取预期值。
3. 通过 `/v1/languages` 获取服务端支持的语言列表（含 RTL 标记与 TTS 提示）以保持前端下拉与通知文案同步。
3. `PROVIDER_PRICING_FILE`（默认 `src/config/providers.cost.json`）锁定预期的每分钟费用与 sigma 基准，指标超出 `cost_rollup_unit_cost_sigma > 2` 会触发 Prometheus Alert。
4. 若要调试或模拟定价异常，可临时更新价格文件或注入低/高费用的生成任务，然后观察 `/v1/analytics/unit-economics` 返回的 `providerSignals` 与 alert 触发。

For details on scraping `/metrics`, re-importing `grafana/dashboards/youtube-observability.json`, and tuning `alerts/prometheus-rules.yaml`, read [docs/observability.md](docs/observability.md).

## License Compliance & Publishing Guardrails

1. Every artifact drops `license.json` next to its workspace files (`writeLicenseFile` in `src/licensing/index.ts`). The metadata includes `{ provider, plan, watermark, redistributable, commercial_use, attribution, tos_url }` so you can trace what the vendor expects.
2. Before any publish action (`/v1/publish` and the background publisher worker) the license file is validated. Watermarking or non-commercial policies automatically block the upload, emit `gen_license_block_total{provider,...}`, and write an audit entry `publish.license_block` in the tenant log.
3. The audit trail and Prometheus counter make it easy to prove compliance: feed the alert into workflow triage, tune the provider plan, or reroute to a compliant asset before retrying the publish.
