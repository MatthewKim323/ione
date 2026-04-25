# frontend/

Client-side code. Browser-only — uses `getDisplayMedia`, `ImageCapture`, `AudioContext`, etc. Imported by client components in `app/`.

## Layout

```
frontend/
├── components/
│   ├── ui/            Design system primitives (Button, Card, etc.)
│   ├── tutor/         Capture surface, hint toast, status indicator
│   └── dashboard/     Pattern cards, sparklines, session timeline
├── hooks/             useCaptureLoop, useAuth0User, useHintAudio
├── lib/
│   ├── capture.ts     getDisplayMedia + ImageCapture.grabFrame
│   ├── diff.ts        Local pixel diff (gates the API call)
│   └── loop.ts        Main 8s capture/diff/post cycle
└── styles/
    └── globals.css    CSS variables, design tokens, base resets
```

## Rules

- **No `process.env.*` access.** Server secrets stay on the server.
- **No imports from `backend/`.** Bundler will refuse, but be explicit anyway.
- The capture loop posts to `/api/process-frame` — that's the only backend touchpoint.
- All audio playback happens here via `new Audio(audioUrl).play()`.
