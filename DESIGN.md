# Design System — ione

## Product Context

- **What this is:** A live math tutor that watches the student work, stays quiet unless intervention is high value, and keeps a personal memory of struggle patterns and sources.
- **Who it's for:** Students doing serious written math (tablet / paper flow), plus the same person when they review what the system remembers (dashboard).
- **Space / industry:** Edtech, AI tutoring, longitudinal learning memory. Peers skew either playful / gamified or cold enterprise dashboard. ione should feel like a **quiet study desk**, not a arcade or a bank.
- **Project type:** Hybrid: **marketing landing** (hero, story, CTA) plus **authenticated product shell** (onboarding, login, signup, dashboard sub-routes) in the Vite + React app under `landing/`. A Next.js app also exists at repo root; new UI there should **align with this document** until a deliberate fork is documented.

## Memorable thing (north star)

**After the first visit, someone should remember:** *This feels like a real notebook on a real desk. Red pencil corrections, green emphasis when something matters, and the product does not shout.*

Every new surface should pass that test. If it feels like generic SaaS chrome, it is wrong for ione.

## Aesthetic Direction

- **Direction:** **Editorial desk + lab notebook.** Warm paper, hairline rules, margin notes in hand script, display type that can go big and italic without turning into a startup meme.
- **Decoration level:** **Intentional.** The desk background uses very light cross-hatch and soft radial washes so the page is not flat browser white. Cards use a soft shadow stack so sheets feel lifted, not pasted.
- **Mood:** Calm, studious, slightly literary. Trust is the product. Loud gradients and bubbly cards would read as cheap relative to the promise of “margin of your page.”
- **Reference:** Internal only: landing flower video + off-white field; dashboard carries the same **#f2f2f2** desk and **#f4ebd6** paper.

## Typography

| Role | Font | Rationale |
|------|------|-----------|
| **Display / hero** | **Outfit** (`--font-display`) | Geometric but warm; works at huge sizes and small UI titles. Italic allowed for voice. |
| **UI labels / nav** | **Jost** (`--font-sub`) | Slightly more editorial than Inter; pairs with Outfit without looking like a template kit. |
| **Data / logs** | **JetBrains Mono** (`--font-mono`) | Cycles, timestamps, monospace discipline. Use `tabular-nums` where numbers align. |
| **Hand margin notes** | **Caveat** (`--font-hand`) | Single use: annotations that should feel human and off-grid. |

**Loading:** Google Fonts, linked in `landing/index.html` (Outfit, Jost, JetBrains Mono, Caveat). Poppins is also loaded for legacy landing bits; **do not** use Poppins for new desk or dashboard UI unless you are editing an existing landing-only block.

**Scale (practical, not a rigid modular scale):**

- Desk hero: `h-display-light` roughly `3.5rem`–`4.75rem` on welcome.
- Section titles: `1.25rem`–`2.25rem` with italic where the voice calls for it.
- Body on desk: `text-base` / `text-sm` with `text-paper-faint` or `text-ink-deep` for hierarchy.

## Color

**Approach:** **Restrained.** One correction red, one forest green for “this matters,” moss / brass for semantic states. Neutrals stay warm.

| Token | Hex | Usage |
|-------|-----|--------|
| `desk` | `#f2f2f2` | Page background for onboarding, auth, dashboard. Matches landing field. |
| `paper` | `#f4ebd6` | Card fill (`notebook-card`), main “sheet” surfaces. |
| `paper-tint` | `#faf3df` | Softer wash inside previews and subtle panels. |
| `paper-warm` | `#efe5cc` | Hover / selected row lift on desk. |
| `ink-deep` | `#161310` | Primary text on light surfaces. |
| `paper-mute` | `#7a7164` | Secondary labels, meta. |
| `paper-faint` | `#4a463f` | Tertiary copy, de-emphasized body. |
| `line` | `#d4c8ad` | Borders, dividers, hairlines on cream. |
| `line-soft` | `#e2d8be` | Softer `divide-*` inside cards. |
| `red-pencil` | `#c4302b` | Primary accent, active nav, errors, margin rule. |
| `forest` | `#1a7a3c` | Italic emphasis that ties to landing hero green. |
| `moss` | `#6b7e4a` | Success / confirmed / “good” states. |
| `brass` | `#c8a44d` | Warnings, pending, medium sensitivity. |

**Dark “ink” palette** (`ink`, `ink-line`, `ink-raise`, `h-display`, `section-label`, etc.) remains for **landing sections that are still dark** and for **legacy components** (e.g. live tutor shell). New work on **desk routes** should use **`desk-page`**, **`notebook-card`**, **`h-display-light`**, **`section-label-light`**, **`pencil-link-light`**, **`cta-light`**.

**Semantic (keep consistent):**

- Success / confirmed: `moss`
- Warning / pending: `brass`
- Error / destructive / dispute: `red-pencil`
- Live / idle capture: red pulse vs muted label

## Spacing

- **Base unit:** **4px** mental model; Tailwind spacing scale as implemented in components.
- **Density:** **Comfortable.** Generous padding on cards (`p-6`–`p-10`), wide max content (`~1100px`) so the desk does not feel like a spreadsheet.
- **Scale:** Follow existing patterns: section gaps `mb-12`–`mb-16`, grid `gap-x-12 gap-y-10` for desk two-column blocks.

## Layout

- **Approach:** **Hybrid.** Landing can break grid for drama; desk and dashboard use a **clear 12-column grid** with predictable breakpoints (`lg:grid-cols-12`).
- **Max content width:** `max-w-[1100px]` on dashboard main column (see `Dashboard.tsx`, `DashboardShell.tsx`).
- **Border radius:** Nearly square cards (`2px` on `notebook-card`) so reads as paper, not plastic chips.

## Motion

- **Approach:** **Intentional.** Page entrances use `motion` with easing `[0.16, 1, 0.3, 1]` (see existing `motion.div` blocks). Micro-interactions on links use CSS under `.pencil-link-light`.
- **Easing tokens:** `--ease-pencil`, `--ease-graphite` in `@theme`.
- **Durations:** Keep entrance animations in the **0.35s–0.7s** band; avoid long choreographed chains on data tables.

## Components (canonical classes)

Use these before inventing new one-off Tailwind stacks on desk surfaces:

| Class | Role |
|-------|------|
| `desk-page` | Full page background + subtle texture + default text `ink-deep`. |
| `notebook-card` | Cream card, warm border, shadow, optional `.with-margin-rule` for red vertical rule. |
| `ruled-paper-light` | Horizontal rules on cream (light mode). |
| `section-label-light` | Uppercase section kicker on desk. |
| `h-display-light` | Large headline on desk (`ink-deep`). |
| `h-forest` | Italic forest accent (landing-aligned). |
| `pencil-link-light` | Underline-on-hover link on light bg. |
| `cta-light` | Primary button on cream (ink border, fills red on hover). |

## SAFE vs RISK (how ione stays distinctive)

**SAFE (category table stakes, keep):**

- Clear typographic hierarchy (display vs meta vs body).
- Obvious primary action (`cta-light`) and destructive affordances in `red-pencil`.
- WCAG-minded contrast on `ink-deep` on `paper`.

**RISK (where ione earns a face, defend these):**

- **Desk texture instead of flat white.** Costs almost nothing; wrong only if you later need pure white for print.
- **Square paper cards + red margin rule.** Reads “notebook” not “card UI.” Risk is looking slightly old-school; that is the point for this brand.
- **Forest green only for selective emphasis.** Keeps tie to landing; risk is under-using it and drifting to all-red.

## Implementation map

- **Tokens and utilities:** `landing/src/index.css` (`@theme` + `@layer components`).
- **Desk surfaces:** `landing/src/components/AuthLayout.tsx`, `landing/src/components/dashboard/DashboardShell.tsx`, `landing/src/pages/Dashboard.tsx`, dashboard feature components under `landing/src/components/dashboard/`.
- **Known gap to close next:** `landing/src/components/Toaster.tsx` still uses dark `ink-deep` chrome; toasts should get a **desk variant** so feedback matches the rest of the shell.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-26 | Initial `DESIGN.md` from design-consultation | Codifies the desk system already implemented in `landing/` and ties it to product north star. |
