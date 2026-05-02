# PHASE 08A — Professional RAG Engine And Document Ingestion Interfaces

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Upgrade RAG without breaking existing personal memory. Add pluggable ingestion and vector-store interfaces with citations, incremental updates, and reliable unavailable states for optional external parsers.

Target files:
- artifacts/api-server/src/routes/rag.ts
- artifacts/api-server/src/lib/rag.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/localai-control-center/src/**/*RAG*,*Settings*,*Workspace*,*Chat*
- tests related to RAG/API

Implement:
1. Ingestion provider interface:
   - built-in current parser
   - MarkItDown adapter config
   - Docling adapter config
   - OCR provider config
   - each optional provider must return explicit unavailable status when missing
2. Vector store interface:
   - existing hnswlib provider preserved
   - LanceDB/Qdrant provider config only if not implemented fully now; unavailable states only
3. Collection metadata:
   - source file, hash, parser used, chunk count, updatedAt, deletedAt, citation info
4. Incremental re-indexing:
   - skip unchanged file hashes
   - remove stale chunks for deleted/changed files
5. Citations:
   - store enough source metadata for answers to cite file/page/section where available
6. UI:
   - collection status
   - parser status
   - re-index button
   - source/chunk inspector
7. Tests:
   - unchanged file skipped
   - changed file re-indexes
   - unavailable parser does not fake success
   - citation metadata stored for simple file

Hard limits:
- Do not remove existing RAG features.
- Do not require Docker/Python/network for default RAG tests.

Closeout:
Update docs and ledger.
```

---
