# Competitions Deadlines + Reminders User Manual

This guide covers the deadline calendar and reminder workflow in Writer Web at `/competitions`.

## What You Get

- `Upcoming deadlines` panel that automatically sorts future competition deadlines from soonest to latest.
- `Set reminder` action on each competition card.
- Reminder modal with:
  - competition and deadline context
  - `Target user ID` (auto-filled from signed-in user when available)
  - optional reminder message

## How To Use

1. Open `/competitions`.
2. Use search filters (`Keyword`, `Format`, `Genre`, `Max fee`) and click `Search`.
3. Review the `Upcoming deadlines` calendar panel for nearest deadlines.
4. In `Results`, click `Set reminder` on a competition.
5. Confirm or edit `Target user ID`.
6. Add optional `Message`.
7. Click `Send reminder`.

If accepted, the page shows a success note: `Reminder scheduled for <competition title>.`

## Signed-In Default Behavior

- When a user is signed in, `Target user ID` defaults to the current session user.
- If no user is signed in, `Target user ID` is blank and must be entered manually.

## Reminder Payload Shape

The UI submits:

- `targetUserId` (required)
- `actorUserId` (from signed-in user when available)
- `deadlineAt` (competition deadline)
- `message` (optional)

## Troubleshooting

- `Error: ...` status means the reminder request failed upstream.
