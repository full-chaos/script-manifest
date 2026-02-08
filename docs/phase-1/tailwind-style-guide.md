# Writer Web Tailwind Guide

This app uses Tailwind CSS as the primary styling system.

## Theme

This pass applies a custom `theme-factory` theme named **Studio Signal**:

- `ink` text scale: deep blue-slate for strong readability
- `cream` surface scale: cool paper tones for cards and backgrounds
- `ember` action scale: warm call-to-action color for primary controls
- `tide` support scale: success/info feedback accents

Theme tokens live in `/Users/chris/projects/script-manifest/apps/writer-web/tailwind.config.ts`.

## Principles

- Use utility-first classes directly in JSX for page-specific layout and spacing.
- Use shared component classes in `/Users/chris/projects/script-manifest/apps/writer-web/app/globals.css` via `@layer components` for repeated patterns (`.panel`, `.hero-card`, `.btn-*`, `.input`, `.subcard`, `.badge`, `.empty-state`).
- Keep visual hierarchy consistent across all pages:
  - Page intro: `.hero-card` + `.eyebrow`
  - Content sections: `.panel`
  - Data rows/cards: `.subcard`
  - Forms: `.stack`, `.grid-two`, `.input`
  - Actions: `.btn-primary`, `.btn-secondary`, `.btn-danger`

## Theme Tokens

Defined in `/Users/chris/projects/script-manifest/apps/writer-web/tailwind.config.ts`:

- `ink.*` for text colors
- `cream.*` for neutral surfaces
- `ember.*` for action colors
- `shadow-panel` for elevated containers
- `font.display` and `font.body` mapped to Next fonts

## Modal Pattern

All create workflows use modal forms:

- Shared component: `/Users/chris/projects/script-manifest/apps/writer-web/app/components/modal.tsx`
- Behavior:
  - `role="dialog"` + `aria-modal="true"`
  - Escape key closes modal
  - Body scroll lock while modal is open
- Use modal flows for creation tasks (`Create project`, `Create draft`, `Create submission`, `Add co-writer`) to reduce page clutter.

## Page Composition Pattern

- Start with a summary hero (`.hero-card`) that explains scope and key actions.
- Follow with data sections as panels (`.panel`) and cards (`.subcard`).
- Surface status and state explicitly:
  - Empty: `.empty-state`
  - Success/info: `.status-note`
  - Error: `.status-error`

## Accessibility

- Keep visible labels for all form controls.
- Maintain semantic heading order (`h1` then section `h2/h3`).
- Use `aria-label` on dynamic controls (submission move target selectors).
- Ensure color contrast by using tokenized text/surface classes rather than ad hoc color values.
