// ASCII art used as decorative elements. Kept in a separate file so they
// can be edited without re-rendering everything else.

// A stylized "IONE" wordmark — wide, low-density, sits behind the closer
// like a half-rubbed-out chalkboard title.
export const ASCII_WORDMARK = `
   ██╗   ██████╗    ███╗   ██╗ ███████╗
   ██║  ██╔═══██╗   ████╗  ██║ ██╔════╝
   ██║  ██║   ██║   ██╔██╗ ██║ █████╗
   ██║  ██║   ██║   ██║╚██╗██║ ██╔══╝
   ██║  ╚██████╔╝   ██║ ╚████║ ███████╗
   ╚═╝   ╚═════╝    ╚═╝  ╚═══╝ ╚══════╝
`;

// A small integral symbol — used as a glyph next to section markers.
export const ASCII_INTEGRAL = `
   ╱│
  ╱ │
 ╱  │
│   │
 ╲  │
  ╲ │
   ╲│
`;

// Pipeline diagram — capture → ocr → reason → intervene → speak/silent
export const ASCII_PIPELINE = `
  iPad → QuickTime → browser ──┐
                                │  every 8s, only on diff
                                ▼
                          ┌──────────┐
                          │  capture │
                          └────┬─────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  │
      ┌──────────┐       ┌──────────┐             │
      │ mathpix  │       │  vision  │             │
      │  v3/text │       │  sonnet  │             │
      └────┬─────┘       └────┬─────┘             │
           └────────┬─────────┘                   │
                    ▼                             │
              ┌──────────┐                        │
              │  reason  │ ◀── canonical solution │
              └────┬─────┘     (cached, per-prob) │
                   ▼                              │
              ┌──────────┐                        │
              │ intervene│ ◀── struggle profile   │
              └────┬─────┘     (backboard memory) │
                   │                              │
        should_speak?                             │
              │                                   │
        ┌─────┴─────┐                             │
        ▼           ▼                             │
   ┌────────┐  ┌────────┐                         │
   │ silent │  │ tts/EL │ ──── student's ear ─────┘
   └────────┘  └────────┘
`;
