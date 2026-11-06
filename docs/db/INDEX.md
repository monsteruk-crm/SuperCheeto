# Data and persistence

The cockpit adds no transcript database. [RAG schema](SCHEMA.md) documents the existing SQLite document index. Existing keys are retained without migration.

| Store | Contents | Lifetime |
| --- | --- | --- |
| Backend memory | Raw transcript, immutable source snapshots, candidate history, answer/request records, pending/deferred work, control lease and armed AUTO | Backend session; bounded working sets |
| Renderer memory | Display cards, selections, target edits and current session state | Renderer session; reconnect keeps historical cards, reload drops them |
| `ui-preferences.v1` | Audio mode/sources, model, preset/custom text and screenshot preference | Electron profile localStorage |
| `cockpit-layout.v1` | Workbench panel proportions | Electron profile localStorage |
| `cockpit-human-notes.v1` | Server-acknowledged human notes | Electron profile localStorage; future inclusion requires explicit selection |
| `benchmark-tests.v1` | Test definitions | Electron profile localStorage |
| `benchmark-images.v1` | Image reference metadata and data URLs | Electron profile localStorage |
| `benchmark-history.v1` | Results/attempts, deduplicated by benchmark ID, capped at 40 runs | Electron profile localStorage |
| `RAG_DB_PATH` | Document metadata, extracted chunks and embedding vectors | Local SQLite; default `backend/data/rag.sqlite` |

Keep answer, Pin this moment and inspected records protect bounded session objects; they do not save cards or speech across application exit. AUTO arming is never persisted. Native Pin window and Focus reset on launch.

Electron uses its normal user-data profile (`audio-transcriber-ui`); localStorage is profile/origin-specific. Separate test profiles and development/file origins do not imply migration or shared data. The isolated acceptance harness uses temporary storage, independent of normal launchers.

Runtime databases and WAL/SHM sidecars are ignored and untracked. Schema documentation is versioned; indexed content is private local data. Preserve existing files and profile keys. [Review safeguards](../adr/0020-review-lifecycle-and-local-data-safety.md), [M10 preservation evidence](../notes/2026-10-26-m10-acceptance.md).
