## YouTube Tool Backend

TypeScript + Express + Prisma API powering the subtitle → TTS → burn-in workflow with JWT auth, task orchestration, AI helpers, and placeholder analytics.

---

### 1. Install & Bootstrap
```bash
cd server
npm install
npm run prisma:gen
npm run prisma:push
npm run dev
```

Environment template: `.env.example`. Required vars include `JWT_SECRET` and `DATABASE_URL`. Optional: `OPENAI_API_KEY`, `OPENAI_MODEL`, `CORS_ORIGIN`, `PORT`.

---

### 2. Front-end Integration
- `VITE_API_BASE` → e.g., `http://localhost:3001`
- `VITE_SSE_URL` → typically `${VITE_API_BASE}/events`
Use the login response token and send `Authorization: Bearer <token>` for protected routes (tasks, pipeline, SSE, etc.).

---

### 3. Key Routes
- `POST /auth/register`, `POST /auth/login`
- `POST /pipeline/submit`, `GET /tasks`, `PATCH /tasks/:id`
- `GET /events?taskId=...` (SSE)
- `POST /ai/titles`
- `POST /ab/upload`, `GET /ab/stats`, `POST /ab/fit`, `GET /ab/report`
- `POST /publish/schedule`, `GET /publish/list`
- `GET /analytics/overview`

Run `scripts/selftest.sh` for a quick smoke test (requires `bash`, `curl`, `jq`).

---

### 4. Directory Overview
```
server/
├─ prisma/schema.prisma       # SQLite schema (User, Task, AbTest, etc.)
├─ src/
│  ├─ server.ts               # Express bootstrap + graceful shutdown
│  ├─ router.ts               # Route registration
│  ├─ routes/                 # auth, pipeline, ai, ab, publish, analytics, health
│  ├─ middleware/             # error handler, requireAuth
│  ├─ utils/                  # env loader, logger, task mapper, HttpError
│  └─ db/prisma.ts            # Prisma client helpers
└─ scripts/selftest.sh        # Integration script
```

**Extension hooks**: integrate Whisper (for transcription) in pipeline creation (`pipelineRouter`), ElevenLabs for TTS in `/ai/titles`, or FFmpeg for burn-in jobs. Task records already store free-form params for hooking external services.

---

### 5. Common Issues
- **Port busy**: adjust `PORT` or free the port (`lsof -i :3001` / `netstat -ano`).
- **CORS blocked**: set `CORS_ORIGIN` to match your front-end origin.
- **SSE disconnects**: ensure proxies allow keep-alive; clients should reconnect automatically using EventSource.
- **Prisma lock / SQLite busy**: stop other processes touching the database; consider `PRAGMA journal_mode=WAL`.
- **SQLite path confusion**: `DATABASE_URL="file:./dev.db"` is relative to `server/`. Use an absolute path if running elsewhere.

---

### 6. Next Steps / TODO
- Wire real worker (Whisper/ElevenLabs/FFmpeg) to the task queue.
- Persist task dependencies via join table (currently in schema, awaiting queue wiring).
- Harden SSE authentication (currently bearer token only).
- Add background scheduler for automatic retries & analytics ingestion.

---

Need help? Run `npm run build` to type-check, `npm run prisma:studio` to inspect data, or ping the pipeline maintainers. Happy shipping!
