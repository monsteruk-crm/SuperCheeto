# Frontend

Electron + React + Vite UI for streaming transcript, selection, and prompt execution. The manual helper desk renders incremental answer text as Markdown/GFM using React elements; raw HTML is disabled.

## Setup
```bash
cd frontend
npm install
```

## Run (dev)
```bash
cd frontend
npm run dev
```
This starts Vite on `http://localhost:5173` and launches Electron.

## Tests
```bash
cd frontend
npm run test          # deterministic Vitest run (jsdom + React Testing Library)
npm run test:watch    # watch mode
```
- Configuration: `frontend/vitest.config.ts` (local; the production build still uses `vite.config.ts`).
- Setup: `frontend/src/cockpit/__tests__/setup.ts` (loads `@testing-library/jest-dom`).
- Test-only helpers/fixtures: `frontend/src/cockpit/__tests__/helpers/` (fake clock, fake WebSocket transport, mocked Gateway/detector) and `frontend/src/cockpit/__tests__/fixtures/` (synthetic messy-speech). These are never imported by application code and perform no network, audio, or paid calls.

## Notes
- Ensure the backend is running on `ws://127.0.0.1:8765` before hitting Start.
- Prompt bar supports switching between `System audio` and `Microphone`, with separate source selectors and meters.
- Use the transcript pane to select text, then run a preset or custom prompt.
- Legacy pane env controls in `frontend/.env` and `frontend/.envb` (`.envb` is loaded by `vite.config.ts` and overrides duplicate keys). These do not configure cockpit panel proportions or target-editor rows:
  - `VITE_MAX_ROWS` controls transcript pane max visible rows before scrolling (default `30`).
  - `VITE_SELECTED_TEXT_ROWS_COLLAPSED` controls pre-send textarea rows when not focused (default `2`).
  - `VITE_SELECTED_TEXT_ROWS_FOCUSED` controls pre-send textarea rows when focused (default `10`).

## Manual workbench (M04/M05)
The Desk has four panels: raw transcript, a fallible questions inbox with detector disable/retry, working answers, and kept/previous answers. Choose 20/45/90 seconds and **Answer recent speech**, or select raw words and **Draft answer from selection**. **Make question** opens an editable human target; Reset restores its frozen source and Clear releases it. View raw highlights original source without hiding surrounding speech. **Pin this moment** preserves source without any generation call.

Guide explicitly selects Preset or Custom, model and refresh. Saved custom text survives switching modes/reloads but is ignored in Preset mode; empty Custom cannot run. Human notes are separate editable context and are included only when selected. In Electron, capture shows a preview, enables inclusion and supports removal; ordinary browsers honestly disable native capture.

Cards stream safe Markdown/GFM into HTML with code/lists/tables; raw HTML is disabled, remote images are not fetched and HTTP(S) links open outside Electron. Copy, Keep, Remove and Stop act on identified cards. Run again creates a new answer from server-frozen source, wording, instruction, notes, model/reasoning, screenshot and retrieved evidence, even after later changes. Keep makes no generation call. Details distinguish actual evidence/usage and backend versus client timings; absent facts remain unavailable. Reconnected historical cards are read-only; no paid command is replayed automatically.

All panels scroll independently; pointer/keyboard separators persist in `cockpit-layout.v1`. Transcript + expands raw space and Reset layout restores defaults. Smaller windows use two-by-two panels. Inspecting older answers preserves the reading anchor while new drafts append. See [completion evidence](../docs/notes/2026-10-25-m04-m05-acceptance.md). Sound/Settings, questions/AUTO, native controls and integrated acceptance are complete within the [M10 evidence and limits](../docs/notes/2026-10-26-m10-acceptance.md).

Current verification: `npm test -- --run` (198 PASS), `npx tsc --noEmit` (PASS), `npm run build` (305 modules, PASS). OS capture/shortcuts have separate [M09 evidence](../docs/notes/2026-10-26-m09-acceptance.md); unit tests do not establish native behavior.

## Sound and Settings (M06)

Open **Sound** in the Desk header for active input, system/microphone devices, quick switch, refresh and transcription Start/Stop. Opening or closing it changes no capture setting or answer. Escape/Done/Close/outside dismissal returns focus to Sound and preserves the raw selection, editor and reading position. The dialog owns keyboard focus while open; background capture/request shortcuts are blocked.

The selected input and its meter remain in the header while Sound is closed. Levels continue when transcription stops. Quiet means RMS below 0.001 and peak below 0.005, not “no voice”; peak at least 0.98 holds a clipping warning for 500ms. Samples become stale after two seconds without matching-source telemetry; disconnect and unavailable devices are distinct. Freshness uses client receive time, not subtraction of backend timestamps.

Device choices reflect backend acknowledgements/fallbacks. Saved choices restore once per connection; refresh does not repeatedly force them back. An inactive device change updates that preference/monitor only. A deliberate active mode/device change invalidates old source work, preserves previous cards and restarts transcription if running. Unchanged selections do not restart. Monitoring releases devices on backend shutdown.

The original separate Settings screen retains query preferences, RAG documents, model catalog, benchmark tests/images, results/logs/history and stored data. Desk and Settings stay mounted so navigation preserves unsaved edits. Existing preference/storage keys are unchanged. RAG Clear applies to the configured index; acceptance used a temporary index and never cleared user documents. See [M06 evidence](../docs/notes/2026-10-26-m06-acceptance.md). M06 used synthetic audio; subsequent hardware/STT/native evidence is recorded in M09/M10.

Historical M06 verification: `npm run test -- --run` 115 PASS; `npm run build` PASS. The three standalone ImportMeta.env errors at that gate were resolved before M09; current typecheck passes. MeterStore is an isolated external subscription; audio_level does not update App state or rerender transcript/answer content.

## M07 inbox/correction

`QuestionInbox` shows fallible proposals, exact source excerpts, review reasons, detector state/disable/retry and revision-aware edit/split/merge/dismiss/undo. Use question selects a frozen target. Make question → edit wording → Save question to inbox creates a human interpretation. Wrong question → Correct and draft answer retains the original card/source and creates a linked draft. A successful server-confirmed save closes the editor; rejection or a stale revision preserves entered text. Candidate history is session-only. Protocol v5 adds candidates; older manual backends remain usable. See [M07 evidence](../docs/notes/2026-10-26-m07-acceptance.md) and [API](../docs/API.md#protocol-v5-question-proposals-and-correction).

## M08 automatic drafts
`AutoControls` uses authoritative v6 state; arming is explicit and never persisted. App sends an interaction hold before revisioned `configure_auto`, waits for the matching server receipt and coalesces changed settings. Rejections require explicit settings retry. Raw selection, target, question/profile/note editors, Settings and pending configuration hold targeting/publication; Sound alone does not. Listening state reconciles header/Sound after reconnect.

Cards distinguish unreviewed AUTO origin, completed generation and held publication. Answer now uses the existing manual builder and lets the server supersede AUTO; Stop AUTO answer pauses it. Pending state annotates the inbox without overwriting interpretation revisions. See [runbook](../README.md#full-auto-m08), [acceptance](../docs/notes/2026-10-26-m08-acceptance.md). `npm test -- --run` passes 186 tests; `npm run build` passes. Standalone `npx tsc --noEmit` now passes: `src/vite-env.d.ts` references Vite client types, resolving the historical three ImportMeta.env baseline errors.


## Native window controls (M09)

**Pin window** keeps the window above others; it is separate from Keep answer and Pin this moment. **Focus answers** shows Working/Kept columns in the same window near900px wide, preserving streams, cards, raw/editor state and layout. **Return to Desk** restores the full workbench and previous window bounds/maximization. Sound, the selected-input meter and Settings stay accessible. Pin and Focus start off each launch; saved audio/model/layout preferences are unchanged.

Answer uses `Ctrl/Command+Alt+Enter`; screen capture retains `Ctrl/Command+Alt+C`. **Window / shortcuts** reports registration results. If another app owns a global key, use the buttons or focused `Alt+Shift+Enter` (answer) / `Alt+Shift+C` (capture). Settings, dialogs and editable fields block background shortcuts. No global Escape is registered.

With two screens, capture matches the primary display by ID. Wayland may show a sharing chooser: approve only your main screen. Only its single consent-selected source is accepted when display IDs are unavailable; ambiguous sources fail explicitly. While permission is pending, repeated capture is blocked. Capture is explicit and local; inclusion in a subsequent answer follows the existing screenshot checkbox.

Electron31.7.7 keeps a functional resizable **opaque** Desk/Focus; native translucency is unavailable in this build. DevTools stays closed by default; use `OPEN_DEVTOOLS=1 npm run dev` from `frontend/` when needed. Verification commands: `cd frontend && npm test -- --run`, `cd frontend && npx tsc --noEmit`, `cd frontend && npm run build`. Native/audio evidence is recorded separately from unit tests.


## Integrated acceptance (M10)

Raw transcript rows are packed with zero vertical padding,18px line spacing at15px type, and compact LIVE/container spacing. Selection, source highlighting and scrolling are preserved. Question detection continues on new finalized speech after empty results; unchanged text is not repeatedly polled. Normal operation has no three-call or90second test limit.

Current gates: backend239tests, frontend198tests, standalone TypeScript and production build305modules PASS. Actual Electron renderer/layout/Settings/RAG/image/AUTO checks and real system-audio→local STT→Gateway manual/AUTO with real embeddings/retrieval passed. Optional native translucency is unsupported. Spontaneous speech lacks reference-aligned STT/speech-end latency and accuracy measurements; absent metrics are unavailable.

See [M10 evidence and screenshots](../docs/notes/2026-10-26-m10-acceptance.md) and [isolated acceptance tooling](../scripts/acceptance/README.md). The synthetic/live test harness has explicit bounds; do not use its watchdog-limited live mode as a normal continuous session. Original runtime RAG files remain ignored and untracked.


## Session storage and configuration

The client advertises protocol versions `[6,5,4,3,2]`. Its ordinary WebSocket endpoint is fixed at `ws://127.0.0.1:8765` in `src/App.tsx`. Vite variables in `.env.example` describe legacy pane controls; the cockpit uses its persisted panel proportions and target editor. No frontend environment variable configures AUTO arming or the WebSocket endpoint.

See the [storage map](../docs/db/INDEX.md) for persistent keys. Keep answer and Pin this moment retain session objects; neither creates a durable transcript archive. Reload drops session cards/candidates; saved layout/preferences/notes and Settings data remain. Pin window and Focus reset on launch. Acceptance uses an isolated Electron profile and does not migrate user data.
