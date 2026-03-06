# Phase 5 Architecture — Issues & Gotchas

## 2026-03-06 Session Start

### Gotchas to Watch For
- compose.yml was heavily modified in Phase 7 — be careful when adding Redpanda config; don't conflict with existing entries
- BaseMemoryRepository is new — task agents should use it as base class in test files
- Task 7 (POC direct call) cannot run curl against gateway unless the stack is actually running — agent should note this limitation
- illustrations.tsx (NOT illustrations/) — Momus corrected this path reference
