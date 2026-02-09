# Leaderboard User Manual

## What this adds

A public Phase 1 leaderboard page at `/leaderboard` with basic ranking and filters.

## Data model in Phase 1

- Ranking is derived from submission + placement outcomes.
- Placement outcomes are weighted (winner/finalist/etc.) and aggregated by writer.
- Filters are supported for `format` and `genre`.

## How to use it

1. Open `/leaderboard`.
2. Optionally set `format` and/or `genre` filters.
3. Click `Refresh leaderboard`.
4. Review score, submission count, placement count, and last update timestamp.

## Scope

- This is the lightweight Phase 1 implementation.
- Full ranking normalization and decay logic remains a later-phase scoring engine milestone.
