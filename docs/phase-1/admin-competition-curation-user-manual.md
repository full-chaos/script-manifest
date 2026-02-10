# Admin Competition Curation User Manual

## What this adds

An admin curation surface at `/admin/competitions` for managing competition metadata.

## How to use it

1. Open `/admin/competitions`.
2. Enter an allowlisted admin user ID (default `admin_01`).
3. Create or upsert competition metadata.
4. Refresh and review current listings.
5. Use `Re-save metadata` for update pass-throughs.

## Access model in Phase 1

- Gateway enforces an admin allowlist.
- Requests pass `x-admin-user-id` for admin operations in local/dev scaffolding.
