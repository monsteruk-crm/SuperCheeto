# M09 native controls acceptance

Status: COMPLETE within M09 native scope. Actual device/STT acceptance is deferred to the final operator checkpoint (M10).

## Implementation

- T01: Electron 31.7.7, Ubuntu 26.04.1, GNOME Shell50.1, Wayland+XWayland. No Electron upgrade.
- T02: typed native IPC, main-window/main-frame sender validation, boolean-only window changes; isolated preload and packaged CSP retained.
- T03–T04: Ctrl/Command+Alt+Enter shares the primary button action; existing Ctrl/Command+Alt+C preserved. Independent registration status, focused fallback, repeat/duplicate suppression, Settings/dialog/editor precedence and listener cleanup.
- T05: Pin window is independent of answer placement/pinned moments. Same-window Focus keeps mounted state, selected-input meter, Sound/Settings and answer columns. Geometry/maximized state restored and bounded to the available display.
- T06–T07: opaque resizable Desk/Focus. No optional secondary renderer, no whole-window opacity, no claimed native blur. [Electron31 transparency limitations](https://github.com/electron/electron/blob/v31.7.7/docs/tutorial/window-customization.md#limitations) explicitly warn that transparent windows are not resizable and DevTools disables transparency. Optional native translucency is unsupported in this build.
- T08: actual native acceptance underway; see final evidence below.

## Automated gates

- `cd backend && .venv/bin/python -m unittest discover -s tests -q`: PASS238.
- `cd frontend && npm test -- --run`: PASS198 (12 files), including10 new native regressions.
- `cd frontend && npx tsc --noEmit`: PASS.
- `cd frontend && npm run build`: PASS305 modules, including Electron compilation.
- Initial new test harness fixes: Vitest needed an explicit `.cts` transform; one query matched both shortcut labels and one expected45s rather than the existing20s default. Fixed harness; no default preference change.

## Isolation

Native acceptance uses `/tmp/cockpit-m09`, a temporary Electron profile and empty temporary SQLite. Only synthetic transcript/telemetry is injected; microphone/system capture and STT are not started. Paid requests, when run, use the existing Vercel AI Gateway adapter and nonpersonal arithmetic text. Private configuration and original RAG data are preserved.

## Native and live-service evidence

- Actual Electron production `file://` and development `http://127.0.0.1:5189/` paths loaded. DevTools closed; contextIsolation=true, nodeIntegration=false, global plain Escape=false.
- Native registration readback: both global shortcuts true normally. A separate fixture application registered both accelerators first; the real app reported both false and displayed the explicit unavailable status. The alternate focused Alt+Shift+Enter still submitted exactly one successful answer.
- Cua Driver foreground OS key delivery targeted a separate application. One Ctrl+Alt+Enter resulted in one `run_context_query`; real Gateway output rendered in an answer card. Driver reported the delivery itself as unverifiable; independent backend receipts and rendered output established the effect. Background pointer route failed once; no success inferred from it.
- Pin native API readback toggled true/false. Actual Focus settled near902 logical pixels, two answer tracks430.773px each, no horizontal page overflow; selected-input meter remained visible. Return retained the exact raw-panel DOM node. Minimize readback=true, restore and bounds restoration functional (fractional compositor scaling prevents assuming pixel-exact dimensions). Repeated in dev and production.
- Two real text answers through the existing Gateway adapter, model `google/gemini-3.8-flash`, both “Seven plus five is twelve.” First: first delta2771.6ms / completion2772.3ms /72 input+6 output tokens. Second (registration-failure fallback): first delta1735.9ms / completion1939.5ms /71 input+6 output tokens. These are backend-adapter clock-domain samples, not STT/speech latency or a model benchmark; each short answer had one content delta, so no live pre-terminal-display claim. No paid outer retry. Detector proposals also ran through the existing enabled detector during the initial synthetic-source session; detector usage/cost was not separately captured. No screenshot was sent to Gateway.
- Screenshot global shortcut produced a local preview before the two-monitor hardening. It was removed without sending it. After the user clarified that only the main screen was approved, capture was changed to match primary display35 (second display33), with a sole consent-selected ID-less Wayland source supported. No secondary-display/desktop capture is used by the test driver. The final capture attempt remains pending in the system chooser, so the hardened real-capture gate is **NOT YET PASSED**. No repeated capture is submitted while pending. Operator must approve only the main screen and confirm the resulting preview.
- [Actual Focus screenshot](m09/focus.png), containing only the isolated application's synthetic state; no desktop thumbnail or personal content.

## Final gates and operator handoff

Implementation T01–T08 COMPLETE. Final main-screen preview observed in actual Electron at M10 entry; pending permission cleared and attachment removed. Required native answer/pin/Focus/registration-failure/dev+production checks PASS; optional translucency has a precise unsupported boundary. The later preview confirmation closes the historical pending capture gate recorded above.

Final automated code checks: backend238 PASS; frontend198 PASS (12 files;10 native regressions); standalone TypeScript PASS; production build305 PASS; `git diff --check` PASS. The native test-only TypeScript `exact` option was removed because Testing Library differs from Playwright; no runtime change was required.

Operator checkpoint, at the end of autonomous work:
1. In the real app, Capture screen/Alt+Shift+C, approve only the main screen if the OS asks, confirm its preview, then Remove screenshot before the audio-only test.
2. Sound: choose the intended microphone/system source, confirm the meter, Start transcription and say/play a short nonpersonal sentence. Confirm final transcript and answer using Ctrl+Alt+Enter or the alternate focused key.
3. Report which source was used and any failure. Actual hardware/STT/quality and speech-to-answer timing remain M10; this milestone does not claim those checks.
