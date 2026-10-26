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
- Optional UI env in `frontend/.env` and `frontend/.envb` (`.envb` is loaded by `vite.config.ts` and overrides duplicate keys):
  - `VITE_MAX_ROWS` controls transcript pane max visible rows before scrolling (default `30`).
  - `VITE_SELECTED_TEXT_ROWS_COLLAPSED` controls pre-send textarea rows when not focused (default `2`).
  - `VITE_SELECTED_TEXT_ROWS_FOCUSED` controls pre-send textarea rows when focused (default `10`).

## Manual workbench (M04/M05)
The Desk has four panels: raw transcript, a detector-disabled questions inbox, working answers, and kept/previous answers. Choose 20/45/90 seconds and **Answer recent speech**, or select raw words and **Draft answer from selection**. **Make question** opens an editable human target; Reset restores its frozen source and Clear releases it. View raw highlights original source without hiding surrounding speech. **Pin this moment** preserves source without any generation call.

Guide explicitly selects Preset or Custom, model and refresh. Saved custom text survives switching modes/reloads but is ignored in Preset mode; empty Custom cannot run. Human notes are separate editable context and are included only when selected. In Electron, capture shows a preview, enables inclusion and supports removal; ordinary browsers honestly disable native capture.

Cards stream safe Markdown/GFM into HTML with code/lists/tables; raw HTML is disabled, remote images are not fetched and HTTP(S) links open outside Electron. Copy, Keep, Remove and Stop act on identified cards. Run again creates a new answer from server-frozen source, wording, instruction, notes, model/reasoning, screenshot and retrieved evidence, even after later changes. Keep makes no generation call. Details distinguish actual evidence/usage and backend versus client timings; absent facts remain unavailable. Reconnected historical cards are read-only; no paid command is replayed automatically.

All panels scroll independently; pointer/keyboard separators persist in `cockpit-layout.v1`. Transcript + expands raw space and Reset layout restores defaults. Smaller windows use two-by-two panels. Inspecting older answers preserves the reading anchor while new drafts append. See [completion evidence](../docs/notes/2026-10-25-m04-m05-acceptance.md). Sound/Settings parity is complete for synthetic M06 scope; question proposals and AUTO are complete for synthetic M07/M08 scope; native/integrated acceptance remain M09/M10.

Verification: `npm run test -- --run` (106 PASS), `npm run build` (PASS). `npx tsc --noEmit` retains the three known ImportMeta.env baseline errors. Screenshot preview/removal is tested with a mocked preload bridge; OS capture/shortcuts are not accepted yet.

## Sound and Settings (M06)

Open **Sound** in the Desk header for active input, system/microphone devices, quick switch, refresh and transcription Start/Stop. Opening or closing it changes no capture setting or answer. Escape/Done/Close/outside dismissal returns focus to Sound and preserves the raw selection, editor and reading position. The dialog owns keyboard focus while open; background capture/request shortcuts are blocked.

The selected input and its meter remain in the header while Sound is closed. Levels continue when transcription stops. Quiet means RMS below 0.001 and peak below 0.005, not “no voice”; peak at least 0.98 holds a clipping warning for 500ms. Samples become stale after two seconds without matching-source telemetry; disconnect and unavailable devices are distinct. Freshness uses client receive time, not subtraction of backend timestamps.

Device choices reflect backend acknowledgements/fallbacks. Saved choices restore once per connection; refresh does not repeatedly force them back. An inactive device change updates that preference/monitor only. A deliberate active mode/device change invalidates old source work, preserves previous cards and restarts transcription if running. Unchanged selections do not restart. Monitoring releases devices on backend shutdown.

The original separate Settings screen retains query preferences, RAG documents, model catalog, benchmark tests/images, results/logs/history and stored data. Desk and Settings stay mounted so navigation preserves unsaved edits. Existing preference/storage keys are unchanged. RAG Clear applies to the configured index; acceptance used a temporary index and never cleared user documents. See [M06 evidence](../docs/notes/2026-10-26-m06-acceptance.md). Actual hardware/STT/native checks remain M09/M10; no user audio test is needed for this milestone.

M06 verification: `npm run test -- --run` 115 PASS; `npm run build` PASS. The 3 standalone ImportMeta.env errors remain the baseline. MeterStore is an isolated external subscription; audio_level does not update App state or rerender transcript/answer content.

## M07 inbox/correction

`QuestionInbox` shows fallible proposals, exact source excerpts, review reasons, detector state/disable/retry and revision-aware edit/split/merge/dismiss/undo. Use question selects a frozen target. Make question → edit wording → Save question to inbox creates a human interpretation. Wrong question → Correct and draft answer retains the original card/source and creates a linked draft. A successful server-confirmed save closes the editor; rejection or a stale revision preserves entered text. Candidate history is session-only. Protocol v5 adds candidates; older manual backends remain usable. See [M07 evidence](../docs/notes/2026-10-26-m07-acceptance.md) and [API](../docs/API.md#protocol-v5-question-proposals-and-correction).

## M08 automatic drafts
`AutoControls` uses authoritative v6 state; arming is explicit and never persisted. App sends an interaction hold before revisioned `configure_auto`, waits for the matching server receipt and coalesces changed settings. Rejections require explicit settings retry. Raw selection, target, question/profile/note editors, Settings and pending configuration hold targeting/publication; Sound alone does not. Listening state reconciles header/Sound after reconnect.

Cards distinguish unreviewed AUTO origin, completed generation and held publication. Answer now uses the existing manual builder and lets the server supersede AUTO; Stop AUTO answer pauses it. Pending state annotates the inbox without overwriting interpretation revisions. See [runbook](../README.md#full-auto-m08), [acceptance](../docs/notes/2026-10-26-m08-acceptance.md). `npm test -- --run` passes 186 tests; `npm run build` passes. Standalone `npx tsc --noEmit` now passes: `src/vite-env.d.ts` references Vite client types, resolving the historical three ImportMeta.env baseline errors.
