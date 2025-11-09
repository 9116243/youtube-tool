# API & SSE Reference

This chapter summarizes the backend REST surface, authentication expectations, and the real-time EventSource channel that powers live queue/portal updates.

## Base URL & authentication

- The default backend URL is `http://localhost:3001` (configured via `PORT` when running `server` and mirrored by `VITE_API_BASE` for the frontend). Adjust `VITE_API_BASE` so the web client points at the same host during development or staging.
- Protected routes require `Authorization: Bearer <token>`. Tokens are issued by `POST /auth/login` and `POST /auth/register`.
- Rate limiting is enforced (`protectedLimiter` with `RATE_LIMIT_WINDOW`/`RATE_LIMIT_MAX`) on the pipeline, tasks, publish, and uploads routes.

## Key endpoints

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | No | Create a user and receive a JWT/token. |
| `POST` | `/auth/login` | No | Exchange credentials for a token. |
| `POST` | `/pipeline/submit` | Yes | Submit one or more render tasks (JSON array) and immediately enqueue them. |
| `GET` | `/tasks` | No | List the most recent 50 tasks (sorted DESC). |
| `GET` | `/tasks/:id` | No | Inspect a single task by `id`. |
| `POST` | `/tasks/:id/retry` | Yes | Retry a specific segment. |
| `PATCH` | `/tasks/:id` | Yes | Pause, resume, or cancel a task (action in `{pause,resume,cancel}`). |
| `POST` | `/uploads` | Yes | Upload assets (multipart `file` field) via Multer + storage adapter. |
| `POST` | `/publish/schedule` | Yes | Schedule a publish job (`title`, `description`, `scheduledFor`). |
| `GET` | `/publish/list` | No | List scheduled publish jobs in chronological order. |
| `GET` | `/analytics/overview` | No | Quick stats for dashboards and SLA tracking. |
| `GET` | `/metrics` | No | Prometheus scrape endpoint (see Observability). |

## SSE progress stream

Connect to `GET /sse/progress?taskId=<id>` to receive JSON progress updates for a specific task.

- **Headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- **Query**: `taskId` must be provided and correspond to a persisted task.
- **Heartbeat**: The server emits a `heartbeat` event every 15 seconds so clients can detect stale connections and trigger reconnects.
- **Payload**: Each `data:` frame contains JSON similar to:

```json
{
  "id": "task_123",
  "progress": 42,
  "status": "RUNNING",
  "phase": "render",
  "step": "segment-03",
  "message": "Applying LUT",
  "metrics": { "vram": 3200 },
  "meta": { "traceId": "xyz-trace" }
}
```

Payloads include `status`, `progress`, contextual `phase/step`, optional `message`, and `metrics`/`meta` for richer reporting.

### Client helper

Use `src/lib/sse.ts` to manage the EventSource lifecycle:

```ts
import { createSSE } from "@/lib/sse";
import { SSE_URL } from "@/lib/api";

const controller = createSSE(`${SSE_URL}?taskId=${taskId}`, (event) => {
  const payload = JSON.parse(event.data);
  // update Zustand store or toast the latest stage
});

// Dispose when finished or unmounted
controller.close();
```

`createSSE` handles heartbeat timers, exponential backoff, and optional `onHeartbeat`/`onError` callbacks. The queue store already wires this up to the live panel (see `src/features/queue/store.ts`), so you can reuse the same event handling for other real-time workflows.

### Operational guidance

- Ensure proxies/load balancers disable buffering (e.g., `proxy_buffering off`) and maintain long `proxy_read_timeout` to keep SSE alive.
- Reconnect logic already logs warnings when retries happen; surface those logs in the UI if you need to debug connectivity.
- Use the `metrics` endpoint to observe `youtube_pipeline_queue_depth`, CPU/memory, and cost signals; they help determine whether the SSE stream is falling behind due to worker backpressure.

For observability, dashboards, and alert rules derived from these endpoints, see [docs/observability.md](./observability.md).
