# Phase Documentation Inventory

Last updated: 2026-02-25 (pm)
Source of truth for scope: `docs/plan.md`

## Feature Set to Phase Mapping

| Original Feature Set | Primary Phase(s) | Notes |
| --- | --- | --- |
| 1. Writer profile and portfolio | 1 | Foundation for all downstream phases |
| 2. Competition and submission hub | 1 | Expanded again in 7 for organizer backend |
| 3. Ranking and discovery system | 3 | Consumes data from phases 1, 2, 4, 7 |
| 4. Paid coverage marketplace | 2 | Revenue and scoring input |
| 5. Peer-to-peer feedback exchange | 4 | Token economy and community loop |
| 6. Industry dashboard | 5 | B2B discovery and writer outcomes |
| 7. Writer development programs | 6 | Operationally heavy programs layer |
| 8. Partner dashboard for competitions | 7 | Optional moat phase; organizer backend |
| 9. Community and content | 1, 6 | Initial content in 1, program/event amplification in 6 |

## Documentation Coverage by Phase

| Phase | Status | Primary Docs |
| --- | --- | --- |
| 0 | Documented and complete | `docs/phase-0/README.md` + policy docs |
| 1 | Documented and implemented | `docs/phase-1/README.md` + user manuals |
| 2 | In review closeout (task/subtask set pending final state transition) | `docs/phase-2/README.md`, `docs/plans/2026-02-16-coverage-marketplace-design.md` |
| 3 | Documented and implemented | `docs/phase-3/README.md` |
| 4 | Documented and implemented | `docs/phase-4/README.md` |
| 5 | Documented and implemented | `docs/phase-5/README.md`, `docs/phase-5/industry-vetting-and-access-user-manual.md`, `docs/phase-5/discovery-collaboration-mandates-user-manual.md` |
| 6 | Documented and implemented | `docs/phase-6/README.md`, `docs/phase-6/programs-kickoff-user-manual.md` |
| 7 | Documented and implemented | `docs/phase-7/README.md`, `docs/phase-7/partner-dashboard-user-manual.md` |

## Phase Feature Status (Beads)

| Beads Feature | Title | Status |
| --- | --- | --- |
| `script-manifest-612` | Phase 2: Paid Coverage Marketplace | In Progress |
| `script-manifest-2h1` | Phase 0: Product and Legal Foundation | Closed |
| `script-manifest-ego` | Phase 1: MVP Hub - Profiles, Hosting, and Competition Directory | Closed |
| `script-manifest-94s` | Phase 3: Full Ranking algorithm and leaderboard | Closed |
| `script-manifest-g0b` | Phase 4: Peer to peer feedback exchange | Closed |
| `script-manifest-n92` | Phase 5: Industry portal and discovery dashboard | Closed |
| `script-manifest-n2h` | Phase 6: Programs and events platform | Completed |
| `script-manifest-nzi` | Phase 7: Partner dashboard for competition organizers | Completed |

## Open Cross-Cutting Backlog (Not Core Phase Features)

- `script-manifest-bil` / `CHAOS-382`: Tier 3 design overhaul (rich media + visual storytelling).
- `script-manifest-bil.4` / `CHAOS-390`: Dark mode and theme toggle.
- `script-manifest-8hw` / `CHAOS-393`: Supabase evaluation.
- `script-manifest-qri` / `CHAOS-394`: managed Fastify hosting evaluation.
- `script-manifest-311` / `CHAOS-395`: OpenSearch replacement with PostgreSQL FTS.
- `script-manifest-7z4` / `CHAOS-396`: MinIO replacement.
- `script-manifest-gy0` / `CHAOS-397`: Redpanda replacement.

## Automation Testing Pyramid Snapshot (2026-02-25)

- Total automated test files: `74` (TS/TSX/MJS).
- Unit/component/route-heavy tests: `64`.
- Integration tests (compose harness): `5`.
- E2E/UX tests (Playwright): `3`.
- CI guardrail inventory minimums currently enforce:
  - page tests: `>= 8` (current `13`)
  - route tests: `>= 5` (current `13`)
  - e2e specs: `>= 3` (current `3`)

Coverage (latest local run):

- Services: lines `55.68%`, statements `55.68%`, branches `38.08%`, functions `13.83%`
- Web: lines `60.3%`, statements `60.3%`, branches `70.3%`, functions `48.52%`

Current coverage threshold gate risk:

- Services `functions` and `branches` are below baseline gate values, so threshold check fails until baseline or coverage is adjusted.

## Remaining Documentation Gaps

- Phase 2 user manuals (provider onboarding, order lifecycle, disputes)
- Phase 3 user manuals (rank methodology admin, appeals, fraud flags)
- Phase 4 user manuals (token economy, listing/review disputes, strike handling)
- API reference consolidation for phases 2-4 (currently split between code and gateway routes)
