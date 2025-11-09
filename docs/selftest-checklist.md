## Selftest Checklist

1. Ensure `DEV_TOOLS=true` and `SELFTEST_ENABLE_EXTERNAL`/`SELFTEST_API_KEY` are set as needed.
2. Start the backend (`npm run dev` in `server_v2`).
3. Run `scripts/selftest.sh` or `powershell ./scripts/selftest.ps1`.
4. Confirm `/v1/selftest` returns `SELFTEST PASS` and that generated ladder/metadata are written under `server_v2/workspace/selftest`.
5. If `SELFTEST_ENABLE_EXTERNAL=true` with a valid key, the automation should exercise generation/effect payloads (route logs indicate extra coverage).
6. The dev webhook runner (`scripts/dev-webhook-echo.ts`) listens on port 4010 and echoes payloads while `DEV_TOOLS=true`.
7. When running inside Kubernetes, follow `README-k8s.md` to provision the charts and expose `PUBLIC_BASE_URL`; the same `/v1/selftest` endpoint should still return `SELFTEST PASS`.
