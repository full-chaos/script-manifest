# Writer Web Tailwind Guide

This app uses Tailwind CSS as the primary styling system.

## Principles

- Use utility-first classes directly in JSX for one-off layout and spacing.
- Use shared component classes in `app/globals.css` via `@layer components` and `@apply` for repeated patterns (`.panel`, `.btn`, `.input`, `.feature-card`).
- Keep visual hierarchy consistent across all pages:
  - Page containers: `.card` / `.panel`
  - Form controls: `.input`, `.stack`, `.grid-two`
  - Actions: `.btn-primary`, `.btn-secondary`, `.btn-danger`
  - Status text: `.status-note`, `.status-error`, `.muted`

## Theme Tokens

Defined in `tailwind.config.ts`:

- `ink.*` for text colors
- `cream.*` for soft surfaces
- `ember.*` for action colors
- `shadow-panel` for primary container depth
- `font.display` and `font.body` mapped to Next fonts

## Page Composition Pattern

- Use a top-level `section` with `space-y-*`.
- Start with a title card (`.card`) and one-line context.
- Place interactive forms in `.card` blocks and outputs in `.subcard` items.
- Avoid inline color values in JSX; use tokens or shared classes.

## Accessibility

- Keep visible labels for all form fields.
- Preserve semantic headings (`h1/h2/h3`) and `aria-label` on dynamic controls.
- Use explicit focus states through `.input` and button classes.
