# Desktop Packaging Playbook

## Recommended Flow
1. Complete and validate the web build (`npm run dev`) before wrapping with a desktop shell.
2. Exercise all workflows with the mock SSE server to ensure queues, downloads, and theming behave as expected.
3. Only after the web experience is stable, enable the Tauri bridge and native capabilities.

## Tauri Guidance
- Pin the toolkit to the following versions for reproducible builds:
  - `@tauri-apps/api`: `2.5.1`
  - `@tauri-apps/cli`: `2.5.1`
- The upstream `@tauri-apps/plugin-shell@^2.4.2` frequently 404s. Prefer the 2.3.x line or the latest 2.5.x release and double-check `allowlist.shell` plus the `identifier` field inside `tauri.conf.json`.
- When shell access is required, keep a dedicated wrapper in `src-tauri/src/main.rs` and gate commands behind allowlists.
- Release builds: `npm run build` followed by `npx tauri build`. Assets live under `src-tauri/icons`; place `icon.png` (1024x1024) and `icon.icns`/`icon.ico` variants there.

## Electron Alternative
If you need a fallback shell, scaffold with `npm create electron-vite@1.0.27` and copy the `dist` output from this project into the Electron `resources` directory. Wire HMR/devtools only for development-production should load local files via `BrowserWindow.loadFile`.

## Packaging Checklist
- Mac: `npx tauri build --target universal-apple-darwin` for universal binaries.
- Windows: include a 256x256 ICO and verify code signing in `tauri.conf.json`.
- Linux: review AppImage vs. Debian packaging and confirm runtime dependencies.
- Always smoke-test auto updates (if enabled) on a staging channel before pushing to production.

