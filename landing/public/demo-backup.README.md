# Demo backup video

`demo-backup.mp4` is the stage failsafe loaded by `/tutor?mode=video`. It is
**not** committed to the repo because we don't want to bloat git with binary
assets that change every dress rehearsal.

## What to drop here

A 720p+ recording of a clean tutor session, ideally:

- 4:3 aspect ratio (matches the on-screen frame box).
- 60–180 seconds.
- Records the full hint surface — the audience should see hints surface,
  audio play (we cannot bake in audio for legal reasons, but the captions on
  the right margin stand in), and a final claim.
- Encoded h.264 + aac, ~5 Mbps. `ffmpeg -i raw.mov -c:v libx264 -c:a aac -b:v 5M demo-backup.mp4`.

## How to test

```
pnpm --filter landing dev
open http://localhost:5173/tutor?mode=video
```

The component degrades gracefully when the file is missing — it shows a
"backup not found" panel rather than breaking the page.

## Why this exists (Phase 5 / R6)

Live screen capture + Anthropic + Mathpix + ElevenLabs is four points of
network failure. The demo-day plan: open `/tutor?mode=video` in a second tab
before the talk. If anything cracks live, switch tabs.
