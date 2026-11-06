# M10 acceptance harness

These scripts use the actual controller/WebSocket transport, SQLite, file readers and React/Electron production components with isolated storage. They do not open the user's runtime RAG database. Normal unit-test/build gates must pass first.

## Synthetic integration

Start from the repository root with a **fresh external temporary workdir**. Preserve the printed path for a second terminal:

```bash
export M10_WORKDIR="$(mktemp -d /tmp/cockpit-m10-XXXXXX)"
export M10_PORT=8767
backend/.venv/bin/python scripts/acceptance/m10_backend.py --workdir "$M10_WORKDIR" --mode synthetic --port "$M10_PORT"
```

The host creates four synthetic `.txt/.md/.docx/.pdf` fixtures, uses deterministic embeddings/catalog/generation and serves WebSockets on the chosen loopback port. Its synthetic-only HTTP control endpoint is that port+14 (`/stats`, `/seed`, `/scenario`). This is test infrastructure, not an application API. Neither actual audio nor paid inference runs in synthetic mode. Stop the host with Ctrl+C after testing.

In another terminal, set the same workdir/port, then:

```bash
export PLAYWRIGHT_MODULE=/absolute/path/to/an/existing/playwright-core
node scripts/acceptance/m10_electron.cjs
node scripts/acceptance/m10_extras.cjs
```

`PLAYWRIGHT_MODULE` is optional if `require('playwright-core')` already resolves. On the verification host it was the existing Codex runtime's `dependencies/node/node_modules/playwright-core`; no application dependency was added. The Electron harness redirects its **native WebSocket constructor's endpoint only** to the isolated port using test initialization. All protocol messages and underlying sockets remain real; production source/config is unchanged. Initial non-owning startup connections are closed on reload. Keep the operator's existing controller alive when testing alongside a live session.

Results: `stats.json`, `rendered.json`, `extras.json` and app-only screenshots in the workdir. Errors abort the current flow. `M10_STAGE=parity|layout` resumes only affected checks during harness recovery; default runs the full first flow. `M10_DEV_URL=http://127.0.0.1:5189` tests an already-running Vite development server; otherwise built file assets load.

Exact requested screenshot sizes use Electron renderer viewport emulation, because the Wayland compositor can clamp oversized native windows. Actual native Focus/bounds/security are checked separately. Screenshots contain only synthetic application content, never desktop/secondary-display captures. The launcher supplied by Playwright uses `--no-sandbox`; this is an automation-launch detail, not a production flag added to the application. Context isolation/disabled Node integration/CSP remain separately checked.

## Bounded live host

`--mode live` retains real local capture/STT, Gateway and embeddings with a separate SQLite. It does not inject transcript or meter data. Start capture explicitly from the real UI. Its acceptance watchdog stops after90seconds, limits answer starts to2 and detector starts to3, and never retries paid inference automatically. Do not use the synthetic renderer flow against this mode: its control endpoints do not exist.

The user's later request for continuous movie transcription was fulfilled using the ordinary controller in a separate operator session, **without** acceptance watchdogs. That ongoing session is recorded in the M10 handoff; do not stop it during synthetic cleanup. Personal settings and original RAG database artifacts remained untouched.
