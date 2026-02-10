# OAuth Sign-In User Manual

## What this adds

The sign-in page now supports a local OAuth scaffold for GitHub in addition to email/password auth.

## How to use it

1. Open `/signin`.
2. Click `Continue with GitHub`.
3. The app starts and completes the local OAuth scaffold flow automatically.
4. On success, your session is stored and all signed-in pages auto-load your user data.

## Notes

- This is a Phase 1 local scaffold designed for fast iteration and testing.
- Provider support in this phase is `github`.
- Session handling stays the same as email/password (`script_manifest_session` in local storage).
