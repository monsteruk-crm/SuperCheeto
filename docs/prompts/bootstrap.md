You are Codex. Build a working desktop app MVP on Ubuntu that:
1) Captures SYSTEM AUDIO OUTPUT locally (what the user hears: YouTube/Zoom/etc) via PipeWire/Pulse monitor source.
2) Transcribes near-real-time with a local model (faster-whisper).
3) Shows a desktop UI where the user can select any portion of the transcript and either:
   - type a custom query, OR
   - choose a preset prompt from a dropdown,
   then send (selected text + optional surrounding context) to Vercel AI Gateway and display the response.

Hard constraints:
- Audio capture MUST be local on the machine (no cloud audio streaming).
- Transcription MUST be near-real-time (partial/live line acceptable; finalized segments every few seconds).
- UI MUST support text selection and “Run prompt on selection”.
- Use Python backend + Electron/React frontend. Communicate via WebSocket on localhost.
- Keep the MVP minimal but end-to-end working.

Tech choices:
- Backend: Python 3.11+, asyncio, websockets, faster-whisper.
- Audio capture on Ubuntu: prefer Pulse-compatible monitor capture using `parec` (works on PipeWire with pulse shim too). Provide fallback to `pw-cat`.
- Audio format: 16kHz, mono, 16-bit PCM.
- Frontend: Electron + React + TypeScript + Vite. Transcript rendered in a selectable pane.

Repository layout:
/
  backend/
    app/
      main.py
      audio_capture.py
      stt.py
      transcript.py
      ai_gateway_client.py
      ws_server.py
      settings.py
    requirements.txt
    README.md
  frontend/
    package.json
    electron/
      main.ts
      preload.ts
    src/
      App.tsx
      components/
        TranscriptPane.tsx
        PromptBar.tsx
        OutputPane.tsx
      types.ts
      ws.ts
    README.md
  README.md

Backend design (must implement):
1) Audio device discovery:
   - Use `pactl info` to get Default Sink name (e.g. alsa_output...).
   - Monitor source is typically "<default_sink>.monitor".
   - Also provide a list of available monitor sources via `pactl list short sources` and filter those containing ".monitor".
   - If discovery fails, allow specifying a source name in config.

2) Audio capture:
   - Spawn subprocess `parec` reading from the chosen monitor source producing raw PCM, then resample to 16kHz mono if needed.
   - Preferred command if possible:
       parec -d <MONITOR_SOURCE> --format=s16le --rate=16000 --channels=1
     If that fails (rare), fallback to `pw-cat` (PipeWire):
       pw-cat --record --rate 16000 --channels 1 --format s16le
     Ensure code detects which command works.
   - Read from stdout in chunks ~20–50ms (e.g. 16000 samples/sec * 2 bytes = 32000 bytes/sec; 0.05 sec ≈ 1600 bytes). Use a stable chunk size like 3200 bytes (100ms) or smaller.

3) STT streaming:
   - Use faster-whisper. Implement a sliding window:
     - Collect audio into a buffer.
     - Every ~0.5s, run a decode on last ~3–6 seconds for partial/live text.
     - Every ~2–4s, finalize segments:
       - Emit final segments with timestamps (t0,t1) and text.
       - De-duplicate / stabilize output by comparing with previous partial result.
   - Keep it simple: a “live line” updated frequently + finalized segments appended.
   - Data model for segments:
     { id, t0, t1, text, is_final }

4) Transcript store + context builder:
   - Store all finalized segments.
   - Provide helper to fetch “context around selection”:
     - Default: selection text + 30 seconds before + 15 seconds after (based on segment timestamps), if available.
   - Provide rolling summary placeholder BUT for MVP you can skip summarization and just use time-window context.

5) AI Gateway query layer:
   - Send text-only to Vercel AI Gateway (no audio). Use environment variable AI_GATEWAY_API_KEY.
   - Implement:
     - Preset prompts list (id, label, instruction template).
     - Request payload: { presetId or customInstruction, selectedText, contextText }
   - Response: plain text (plus optional structured metadata).
   - IMPORTANT: Do not pretend to do web fact-checking. If preset is "Fact check", wording must be "check for internal consistency and flag uncertain claims" unless browsing is added.

6) WebSocket server:
   - One WS endpoint on localhost (e.g. ws://127.0.0.1:8765).
   - Messages from backend -> frontend:
     - transcript_live: { text, t }
     - transcript_segment: { segment }
     - status: { state, details }
     - query_response: { requestId, text }
     - error: { message }
   - Messages from frontend -> backend:
     - set_audio_source: { sourceName }
     - start_transcription / stop_transcription
     - run_query: { requestId, presetId|null, customInstruction|null, selectedText, selectionTimeRange|null }
   - Backend must be robust: handle reconnects, multiple UI refreshes, stop/start.

Frontend design (must implement):
1) Layout:
   - Left: TranscriptPane (scrolling list of finalized segments + a “Live” line at top or bottom).
   - Top bar: PromptBar with dropdown presets + custom instruction textbox + “Run” button.
   - Right/bottom: OutputPane showing latest model response.

2) Selection behavior:
   - TranscriptPane content must be selectable (standard HTML text selection).
   - On selection change, store selectedText in state.
   - “Run” sends selectedText + chosen preset/custom instruction.
   - Add buttons:
     - Run preset
     - Run custom
   - If selectedText is empty, disable Run.

3) Presets (include these in MVP):
   - “Fact check (no browsing)”: "Identify claims that may be wrong; explain uncertainty; suggest what to verify."
   - “Answer the question”: "Answer clearly and concisely."
   - “Write JavaScript code”: "Write JavaScript code to satisfy the request; include edge cases."
   - “Extract action items”: "List action items with any owners/dates mentioned."

4) WebSocket client:
   - Auto-connect with retry.
   - Render transcript updates smoothly.
   - Keep transcript in memory; allow clear/reset.

MVP milestones (implement in order):
A) Backend WS server + dummy transcript messages to prove UI wiring.
B) Audio source discovery + capture from monitor and print RMS level to verify it’s real system audio.
C) Faster-whisper transcription producing live line + finalized segments.
D) UI shows streaming transcript, selection works, “Run” triggers backend.
E) OpenAI query call returns response in OutputPane.

Build/run instructions (must provide):
- backend: python venv, pip install -r requirements.txt, run main.py
- frontend: npm install, npm run dev (Electron dev mode)
- .env usage: AI_GATEWAY_API_KEY
- Note about Ubuntu audio: requires Pulse/PipeWire running; monitor sources available; user may need to select correct monitor.

Quality requirements:
- Provide clear error messages if:
  - no monitor sources found,
  - parec/pw-cat not installed,
  - model not downloaded,
  - AI_GATEWAY_API_KEY missing.
- Avoid blocking UI; all backend work async.
- Keep code readable, small, and testable.

Now implement the repo with working code. Do not leave TODOs for core flow. Ensure “end-to-end works” on Ubuntu.
```

