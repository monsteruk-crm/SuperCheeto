# Repository Guidelines (Agents)

This file is the *operating manual* for Codex/agents working in this repo. It defines:
- where the canonical requirements live,
- how to keep documentation continuously updated after every iteration,
- token discipline + “working memory” rules so the agent does not re-read the whole repo every loop.

## Canonical Sources
- **Build brief / scope of truth:** `docs/prompts/bootstrap.md` (do not drift from it without an ADR).  
- **User-facing runbook:** `README.md` (must match reality).  
- **This file:** `AGENTS.md` (how we work).

## Project Structure & Module Organization
- `backend/` contains the Python WebSocket service and transcription pipeline (`backend/app/`).
- `frontend/` contains the Electron + React UI (`frontend/src/` and `frontend/electron/`).
- `docs/` contains the bootstrap prompt and all living docs, indexes, ADRs, and schema notes.

## Build, Test, and Development Commands
- `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` — set up backend.
- `cd backend && python -m app.main` — run the backend service.
- `cd frontend && npm install` — install frontend dependencies.
- `cd frontend && npm run dev` — run Electron + Vite in development mode.

## Coding Style & Naming Conventions
- Indentation: 4 spaces (PEP 8).
- File and module names: lowercase with underscores if needed (e.g., `data_loader.py`).
- Function and variable names: `snake_case`.
- Class names: `PascalCase`.
- If you add tooling (Ruff/Black/ESLint/Prettier), document it in `README.md` and add the exact commands.

## Testing Guidelines
- If tests are added:
  - backend tests under `backend/tests/`
  - frontend tests under `frontend/` (or `frontend/src/**/__tests__`)
- Document the commands you actually run in PR descriptions and `docs/CHANGELOG.md`.

---

# Documentation System (keep docs updated every iteration)

## The rule
**Every code change must either:**
1) update existing docs that are now wrong, OR  
2) add a new doc/ADR that explains the new behavior/decision, AND  
3) update the relevant index so future iterations don’t re-scan the whole repo.

## Required “living docs” (create if missing)
These are intentionally small and index-driven.

### 1) `docs/INDEX.md` (the navigation hub)
Purpose: a single page that points to everything else, so the agent can open *one file* to locate the rest.

Minimum sections:
- Current status (link to `docs/STATUS.md`)
- Architecture (link to `docs/ARCHITECTURE.md`)
- API / WebSocket protocol (link to `docs/API.md`)
- ADR index (link to `docs/adr/INDEX.md`)
- Data / persistence (link to `docs/db/INDEX.md` if/when DB exists)
- Release notes (link to `docs/CHANGELOG.md`)

### 2) `docs/STATUS.md` (the working memory)
A short, continuously updated snapshot:
- What works end-to-end right now
- What is in progress
- Next 3 priorities
- Known issues / blockers (with pointers to code paths)
- Quick “how to verify” checklist

### 3) `docs/API.md` (WebSocket + payload contracts)
Keep it aligned with `README.md` and actual server/client code:
- Endpoint(s), reconnect semantics
- Message types (backend→frontend, frontend→backend)
- JSON payload schemas + examples
- Versioning notes (if changed, add an ADR and bump a protocol version field)

### 4) `docs/ARCHITECTURE.md` (just enough)
- High-level diagram in text (components + data flow)
- Key modules and responsibilities
- Critical runtime assumptions (Pulse/PipeWire monitor, local STT, etc.)

### 5) `docs/CHANGELOG.md` (release notes steward file)
Append one bullet list per iteration/PR:
- What changed (user-visible)
- What changed (internal)
- How to test

---

# ADRs (Architecture Decision Records)

## When to write an ADR
Write an ADR whenever you:
- choose between meaningful alternatives (libraries, protocols, threading model),
- change the WebSocket protocol,
- change audio capture strategy,
- change persistence strategy (file/DB),
- introduce caching/memory mechanisms,
- make a performance or security tradeoff.

## ADR storage
- Folder: `docs/adr/`
- Index: `docs/adr/INDEX.md`
- Filename: `NNNN-short-title.md` (4-digit, zero-padded)

## ADR template
Create new ADRs using this template:

```md
# ADR NNNN: <Title>

## Status
Proposed | Accepted | Superseded by ADR NNNN

## Context
What problem are we solving? What constraints matter?

## Decision
What we chose.

## Alternatives considered
- Option A: pros/cons
- Option B: pros/cons

## Consequences
Operational impact, risks, follow-ups, migration steps.
```

---

# Data / Database / Tables (only when applicable)

If/when a DB is introduced (SQLite/Postgres/etc.), add:
- `docs/db/INDEX.md` (links)
- `docs/db/SCHEMA.md` (human-readable schema)
- Optional: `docs/db/schema.sql` (authoritative DDL snapshot)

## Table documentation rules
For every table, document:
- purpose
- columns (name, type, nullable, default)
- indexes + why they exist
- foreign keys / relationships
- migration notes (if changed)

Suggested per-table stub:

```md
## <table_name>
Purpose: …

Columns:
- id (INTEGER, PK) — …
- …

Indexes:
- idx_<...> — …

Notes:
- …
```

---

# Token Discipline (do not waste context)

## Principle
**Never re-read large docs or many files by default.** Use the indexes and small “memory” docs.

## Default read order (per iteration)
1) `docs/INDEX.md`
2) `docs/STATUS.md`
3) Only the specific doc(s) linked by the index that are relevant to the current task
4) Only then open code files needed for the change

## Practical rules
- Prefer *one* authoritative doc over duplicating content across files.
- Keep docs short; link out instead of copying blocks of text.
- When changing a contract (API/messages/CLI flags), update the doc *in the same commit*.
- Avoid “wall-of-text” logs; if you need a log, create a dated note under `docs/notes/YYYY-MM-DD.md` and link it from `docs/STATUS.md`.

## “Index first” rule
Whenever you create or rename a doc, immediately update:
- `docs/INDEX.md`, and
- any relevant sub-index (`docs/adr/INDEX.md`, `docs/db/INDEX.md`).

---

# Memory Rules (agent working state)

## Where “memory” lives
The agent’s durable memory is the repo itself, specifically:
- `docs/STATUS.md` (current state)
- `docs/INDEX.md` (navigation)
- ADRs (decisions + why)
- `docs/CHANGELOG.md` (what changed)

## What must be written after each iteration
At the end of every meaningful iteration (feature/bugfix/refactor that changes behavior), do all of:
- Update `docs/STATUS.md` (what works, what changed, what’s next)
- Append to `docs/CHANGELOG.md`
- If a decision was made: add/update an ADR + update `docs/adr/INDEX.md`
- If API changed: update `docs/API.md` + update `README.md` if it documents the same info

---

# Roles (Agents)

- **Documentation Lead**
  - Owns `README.md`, `docs/INDEX.md`, and `docs/STATUS.md`.
  - Ensures alignment with `docs/prompts/bootstrap.md`.

- **Backend Docs Writer**
  - Owns `docs/API.md` backend→frontend + frontend→backend message schemas.
  - Documents audio capture prerequisites and error modes.

- **Frontend Docs Writer**
  - Documents Electron dev workflow, UI behavior, and WS client usage.
  - Keeps `frontend/README.md` accurate if it exists.

- **ADR Steward**
  - Owns `docs/adr/INDEX.md` and ensures every major choice is captured.

- **Release Notes Steward**
  - Owns `docs/CHANGELOG.md` and PR “how to test” notes.

---

# Commit & Pull Request Guidelines
- Use clear, imperative commit messages.
- PRs should include:
  - Summary of changes
  - Testing notes (commands + results)
  - Screenshots/logs when UI/output changes are visible
  - Doc updates checklist (links to updated docs)

## Doc updates checklist (paste into PRs)
- [ ] `docs/STATUS.md` updated
- [ ] `docs/CHANGELOG.md` appended
- [ ] `docs/API.md` updated (if protocol changed)
- [ ] `README.md` updated (if setup/run changed)
- [ ] ADR added/updated (if a decision was made)
- [ ] `docs/INDEX.md` updated (if any doc added/renamed)

---

# Configuration Tips
- Target Python version is `>=3.11`.
- Backend requires `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) in environment or `backend/.env.local`.
- Cloud AI uses Vercel AI Gateway; local STT/audio remain entirely local.
- Keep `backend/requirements.txt` and `frontend/package.json` updated when adding deps/tooling.
