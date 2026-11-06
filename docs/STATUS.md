# Status

Updated: 29 October 2026. The Live Helper cockpit execution plan is COMPLETE through M11, including RT01/M3bis. Exact gates, history and next task (`NONE`) are in the [progress ledger](plans/live-helper-cockpit-progress.md).

## What works end-to-end

- Citation validator follow-up: grouped document citations are checked ID by ID, avoiding false failures for `[doc:0, doc:1]`; genuinely unretrieved IDs still fail. Running backend needs restart to load this source fix.

- Quick layout follow-up: Kept / previous is hidden; Working answers occupies both answer-column widths (full bottom row on compact screens, full Focus area). Kept records remain in session; an overlay was deferred at user request for speed.

- Interview trainer custom instructions are saved in [docs/prompts](prompts/interview-trainer-custom-instructions.md) for manual use in Guide / profile; saving the prompt does not change application settings.

- Follow-up: Guide / profile Custom instruction input now shows 10 rows. README explains where Human context notes live and how Include in future answers works.

- Follow-up: Possible questions, Working answers and Kept / previous follow the bottom automatically on incoming/growing content. This supersedes answer reading-anchor preservation; scrolling up follows again on the next content update.

- Follow-up: Guide / profile stays within the viewport; answer controls show a prominent error alert with screenshot recovery guidance and a Preparing answer state. Automated verification recorded in the changelog; live audio and rendered acceptance not repeated.

- Follow-up: Start/Stop transcription is now directly beside the main audio meter in both Desk and Focus, using the existing Sound capture actions and connection/ownership/source guards. Rendered/live acceptance of this follow-up has not been run.

- Local system/microphone capture and faster-whisper feed selectable raw speech. Manual answers freeze recent 20/45/90-second context or selected/human-set targets, independently of detection.
- Genuine Gateway text deltas render as safe Markdown/GFM before completion. Cards retain partial failures/cancellation, original sources, frozen reruns and separate backend/client timings.
- Fallible question proposals support edit/split/merge/dismiss/undo and source-linked Wrong question recovery. Explicitly armed, backend-owned FULL AUTO has one active/newest pending answer, manual priority and publication holds. Reconnect remains Assist; no paid replay.
- Sound preserves focus/selection and capture lifecycle; meters are source-labelled and isolated from transcript rendering. Original Settings, RAG readers, model catalog, benchmark/image workflows and persistent keys retain parity.
- Native answer/capture shortcuts, registration fallback, Pin window and same-window opaque Focus passed actual Electron checks. Optional native translucency is unsupported.
- [M10 acceptance](notes/2026-10-26-m10-acceptance.md) records 28 clean rendered/interaction checks, real system-audio → local STT → manual/eligible AUTO Gateway answers and real embeddings/RAG. [M09](notes/2026-10-26-m09-acceptance.md) provides separate native evidence. These observations were made on 26 October; no live acceptance was repeated during M11 documentation work.
- Fresh 27 October checks: backend **239 PASS**, frontend **198 PASS / 12 files**, standalone TypeScript **PASS**, production build **PASS / 305 modules**. [M11 handoff](notes/2026-10-27-m11-handoff.md) records commands and the documentation audit.

## In progress

No remaining task in the cockpit plan. Existing M09/M10 changes and M11 documentation remain uncommitted. No commit or publication was requested.

## Next 3 priorities

1. Operator quality review of STT/proposals on representative speech, with reference annotations if accuracy or speech-end latency measurements are needed.
2. Separately scope configuration improvements: the UI endpoint is fixed at port 8765; several backend settings read environment at import time.
3. Review the accumulated diff for a future commit/PR update when requested. Preserve private runtime databases and existing profile data.

## Known limits and runtime state

- Electron 31.7.7 uses the accepted opaque Desk/Focus fallback. No native translucency or blur claim. See [ADR 0021](adr/0021-native-controls-and-opaque-focus.md).
- Speech-aligned STT latency, WER/semantic accuracy and billed answer cost are unavailable. Provider tokens/backend timings exist. Microphone hardware and paid benchmark acceptance were outside the system-output smoke.
- Transcription is forced to English by `backend/app/main.py::_language_for_mode`; legacy language variables do not change it.
- Ordinary UI connection is fixed at `frontend/src/App.tsx` port 8765. `BACKEND_WS_PORT` changes launcher checks, not the UI endpoint.
- `backend/app/settings.py` reads WS/audio/STT/RAG-path defaults at import. Export these before Python starts; cloud/detector settings read the loaded dotenv values at construction. See [backend configuration](../backend/README.md#final-verification-and-runtime-configuration).
- Keep answer protects a session card; application exit/reload is not a durable answer archive. [Persistence map](db/INDEX.md).
- Yesterday's continuous operator session is no longer running: recorded PIDs absent and ports 8765/8767/8770/5189 idle at the M11 check. No process was started, stopped or reconfigured in M11. Historical PIDs and temporary storage remain documented in M10.

## Quick verification

1. From `backend/`, run `.venv/bin/python -m unittest discover -s tests -q`.
2. From `frontend/`, run `npm test -- --run`, `npx tsc --noEmit` and `npm run build`.
3. From the repository root, run `git diff --check`.
4. For a deliberate normal session, inspect existing listeners, then use the [README launch instructions](../README.md#quick-start). Check selected source/meter before starting transcription. Use temporary nonpersonal documents for any RAG check.
5. For isolated rendered acceptance, follow the [acceptance tooling](../scripts/acceptance/README.md). Keep synthetic and actual device/Gateway results separate. Paid/live/native checks are not implied by unit tests or builds.
