# RAG schema

Authority: `backend/app/rag_store.py`, `RagStore._init_schema`. Both tables use SQLite WAL mode. There are no explicit column defaults. Non-key columns are NOT NULL. SQLite TEXT primary keys have no explicit NOT NULL constraint; the application always supplies their IDs. No cockpit table or migration was added.

`file_path` has a UNIQUE index for upserts. Text primary keys have SQLite uniqueness indexes. The foreign key below declares cascade behavior, but this connection does not enable `PRAGMA foreign_keys`; application code explicitly deletes chunks when clearing/rebuilding documents.

## `documents`
Purpose: Tracks each ingested source file and ingestion metadata.

Columns:
- `doc_id` (TEXT, PK) - stable id derived from file path.
- `file_path` (TEXT, UNIQUE, NOT NULL) - absolute source path.
- `title` (TEXT, NOT NULL) - filename label.
- `sha256` (TEXT, NOT NULL) - hash of extracted text to detect unchanged docs.
- `file_size` (INTEGER, NOT NULL) - source file size in bytes.
- `file_mtime` (REAL, NOT NULL) - source file mtime timestamp.
- `chunk_count` (INTEGER, NOT NULL) - number of indexed chunks.
- `updated_at` (REAL, NOT NULL) - ingest timestamp.

Indexes:
- `idx_documents_updated_at` - newest-first doc listing.

Notes:
- Upserted on re-ingest; unchanged docs are skipped by hash.

## `chunks`
Purpose: Stores chunk text and embedding vectors for retrieval.

Columns:
- `chunk_id` (TEXT, PK) - `<doc_id>:<chunk_index>`.
- `doc_id` (TEXT, NOT NULL, FK -> `documents.doc_id`, ON DELETE CASCADE) - owning document id.
- `chunk_index` (INTEGER, NOT NULL) - sequence in source doc.
- `text` (TEXT, NOT NULL) - chunk text.
- `vector` (BLOB, NOT NULL) - float32 embedding bytes.
- `dim` (INTEGER, NOT NULL) - vector dimension.
- `norm` (REAL, NOT NULL) - vector L2 norm for cosine similarity.

Indexes:
- `idx_chunks_doc_id` - efficient chunk delete/rebuild per document.

Notes:
- Retrieval is cosine similarity over persisted vectors.


## Migration and retention notes

Initialization uses `CREATE TABLE/INDEX IF NOT EXISTS`. M00–M11 retain the existing schema and local data. The index stores extracted document text and vectors, not transcripts, questions or answer cards. Ingestion and clear are explicit Settings actions; acceptance uses a separate temporary database. See the [storage map](INDEX.md).
