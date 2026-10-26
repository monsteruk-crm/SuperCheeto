# ADR 0020: Review lifecycle cleanup and local runtime data

## Status
Accepted. PR #1 remediation; verification is recorded in the [review evidence](../notes/2026-10-26-pr1-review-remediation.md).

## Context
Review found lost disconnect cleanup after failed sends, manual generation outliving its valid session epoch, text-only deduplication suppressing later speech, recursive status polling and personal document data already tracked in SQLite sidecars in an earlier PR commit.

## Decision
- Route normal close, failed sends/broadcasts and connect-hook failure through one per-connection cleanup task. Remove the registry entry once; invoke disconnect cleanup once. Shield that task so cancelling the failing answer sender cannot cancel lease cleanup; close the failed socket after cleanup.
- Before advancing a session epoch, finish matching cancellation of all active answers and send their definitive superseded outcome in the old epoch. Keep partial text and frozen evidence. Stop listening cancels manual generation as well as AUTO work.
- Restrict STT prefix/suffix suppression to overlapping decoded audio times. Unknown timestamps do not prove overlap. Transcript duplicate checks additionally require overlapping time, the same source and current audio epoch; short repeats remain audible evidence.
- A status read receives a command_ack for its own commandId in addition to command_status for the queried commandId. Existing payloads and negotiated versions remain unchanged. Status-read timeouts terminate without requesting status recursively, including with older servers that omit the read acknowledgement.
- Ignore the runtime backend/data directory and untrack its database/sidecars without changing local bytes. Remove these paths from every commit introduced by this PR. Preserve a local recovery ref, check the remote head, then use a branch-specific force-with-lease update. Do not rewrite the shared base branch. Existing base history and hosting caches are outside this scoped cleanup.

## Alternatives considered
- Keep manual generation across epoch changes: requires accepting historical request events across the current epoch; definitive cancellation uses the existing lifecycle and avoids background inference with discarded output.
- Delete failed registry entries without notifying: strands ownership. Run cleanup inline in the answer task: can cause self-cancellation/deadlock. One shielded task centralizes all paths.
- Retry reconciliation reads indefinitely: unbounded calls after packet loss. A failed read stays unknown and requires explicit later recovery.
- Delete database files locally or only in the latest commit: local deletion loses user data; tip-only deletion leaves personal blobs in the PR's introduced history.

## Consequences
No new wire version, payload fields, database schema or dependency. Stop listening now visibly supersedes active manual drafts and preserves partials. Local indexes are recreated by the existing RAG store on fresh checkout. Scoped PR history cleanup changes unmerged commit hashes; historical ledger hashes refer to the pre-review branch. Existing shared history is not erased.
