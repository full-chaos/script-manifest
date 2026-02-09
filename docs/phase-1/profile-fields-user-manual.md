# Writer Profile Fields User Manual

This guide covers the profile fields available on `/profile` in writer web.

## Available Fields

- **Display name**: Public name shown on your profile.
- **Bio**: Long-form summary of your writing background.
- **Genres (comma separated)**: Genre focus tags (for example `Drama, Thriller`).
- **Demographics (comma separated)**: Optional identity descriptors you choose to publish.
- **Representation status**: One of `Unrepresented`, `Seeking rep`, or `Represented`.
- **Headshot URL**: Optional public image URL for your profile photo.
- **Custom profile URL**: Optional canonical public profile URL.
- **Allow profile in search results**: Turns profile indexing/discovery on or off.

## Save Behavior

- Click **Save profile** to persist all fields in one update.
- Click **Refresh profile** to re-fetch and reload server values.
- If validation fails, the UI shows an API error message and no data is saved.

## Validation Rules

- `bio` maximum: 5000 characters.
- `genres` and `demographics` accept up to 20 entries each.
- `headshotUrl` and `customProfileUrl` must be empty or fully qualified URLs (`https://...`).
- `isSearchable` is a boolean toggle and defaults to `true` for existing profiles.

## Backward Compatibility Notes

- Existing profiles without the new fields are automatically backfilled with defaults.
- Defaults:
  - `demographics = []`
  - `headshotUrl = ""`
  - `customProfileUrl = ""`
  - `isSearchable = true`
