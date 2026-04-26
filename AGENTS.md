# Agent notes — ione

## Design System

Always read **`DESIGN.md`** at the repo root before making visual or UI decisions for user-facing surfaces.

- **`landing/`** (Vite + React): desk theme tokens and utilities live in `landing/src/index.css`. Prefer existing classes (`desk-page`, `notebook-card`, `section-label-light`, `h-display-light`, `pencil-link-light`, `cta-light`) over new ad-hoc stacks.
- **Do not deviate** from `DESIGN.md` without explicit user approval (color, typography, motion).
- In QA or review, **flag** components that still use the dark `ink` chrome on authenticated desk routes (e.g. toasts) until they are aligned.
