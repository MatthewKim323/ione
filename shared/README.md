# shared/

Types, constants, and utilities used by both `frontend/` and `backend/`. Pure data — no I/O, no env access, no React, no Node-specific APIs.

## Examples of what goes here

- `types.ts` — `HintType`, `StepStatus`, `ErrorType`, `PatternData` etc.
- `constants.ts` — `CAPTURE_INTERVAL_MS`, `STALL_THRESHOLD_MS`, `COOLDOWN_MS`, `CHANGE_THRESHOLD`

## What does NOT go here

- React components → `frontend/components/`
- API client wrappers → `backend/integrations/`
- Agent prompts → `agents/*/prompt.ts`
- Anything that imports from `next/*`, `node:*`, or browser globals
