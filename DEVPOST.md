# ione — Devpost draft

Voice: conversational, direct (same family as the iris example). Tweak names and numbers to match your hackathon story.

---

## Inspiration

serious math is a written medium. the best feedback isn’t a chat panel interrupting you every line—it’s a teacher who watches, stays quiet, and only speaks when the mistake is worth the interruption. the tools that exist today are either a generic chat that doesn’t *see* your work, or dashboards that look like a bank. students doing real work on a tablet or paper need something that feels like a quiet desk, not a casino.

so we started from a different gate than “faster answers.” the gate is **judgment under uncertainty**: you only break silence when the intervention is high value—and you keep a **memory of how this person actually struggles** over time, not a one session generic bot.

---

## What it does

**ione** is a live math tutor that watches the student’s work, runs a full perception-and-reasoning stack on what’s on the page, and only surfaces a hint when the policy says it’s worth the noise. the product has two sides: a **desk** (landing, auth, onboarding, dashboard) and a **live session** where capture flows into a multi-agent loop with streaming progress back to the UI.

on the data side, it keeps a **longitudinal model**: a supabase-backed **knowledge graph** so claims about the learner are **grounded in what they actually uploaded**—receipts by construction, not vibes. live sessions are persisted as **cycles and hints** so you can build toward replay, analytics, and “why the tutor didn’t speak” transparency.

---

## How we built it

**the client.** a vite + react app with a route graph that matches real product state: public landing, login/signup, protected onboarding, then a dashboard with multiple sub-routes (patterns, sessions, session detail, sources) and a dedicated **/tutor** surface. auth is supabase; **protected routes** key off the profile’s onboarded state so you don’t trap users in half finished setup.

**the memory layer (supabase).** migrations define **profiles**, the student-scoped **knowledge graph** (uploaded source files, extracted chunks, entities, claims, relationships, and an event stream for reacting to new uploads), plus the **tutor** tables for sessions, per tick cycles, and surfaced hints. row level security keeps everything owner scoped.

**the live loop (hono on node).** a single **POST /api/cycle** accepts a captured frame plus a structured payload (session, stall signals, a short **trajectory** of recent state). the server authenticates a supabase jwt, looks up the session, and returns **server-sent events** so the browser can show a live trace. the **orchestrator** runs **OCR**, runs **reasoning** and **predictive** in parallel, then a **policy** layer decides if this tick should stay silent, and an **intervention** agent can produce a real hint. “help” and **push to talk** paths exist so student-initiated assistance isn’t the same as autonomous nagging. optional paths hit **TTS** and **transcribe** services when configured.

**how the web talks to the API.** a tiny `authedFetch` layer knows the API base url (env override, or a LAN friendly default so an ipad on the same network isn’t talking to the wrong `localhost`).

**design system.** a deliberate **desk + lab notebook** aesthetic: warm paper, hairline rules, display type, restrained color so it reads “trust” instead of “generic saas”.

---

## Challenges we ran into

**orchestration is the whole product, not a single model call.** OCR, step evaluation, a parallel predictive path, a policy with cooldowns and de duplication, and an intervention pass all have to agree on one coherent moment in the UI. early versions could either talk too much or feel dead—so the work is in the *edges*: stall detection, duplicate hint suppression, and student initiated modes that shouldn’t be punished by the same gates as background capture.

**cost and latency on a loop.** a naive implementation pays for the whole stack on every tick. the codebase explicitly treats things like a cached canonical solution and parallel fan out as first class so demo latency stays human, not theatrical.

**SSE over POST.** browsers don’t give you a stock `EventSource` for multipart POST, so the client and server have to hand roll streaming consumption with clear error surfaces when the API isn’t running or a token is wrong. “failed to fetch” is never enough for a user, so the client spells out the URL it tried to hit.

**data discipline for memory.** a graph that can say anything is a liability. the project pushes toward “no chunk, no claim” so tutor memory doesn’t turn into confabulation.

---

## Accomplishments that we’re proud of

**a full vertical slice:** auth, desk ui, a live tick loop, streaming events, and persistence for sessions and the knowledge graph, not a mocked demo video.

**a policy shaped tutor, not a chat with a whiteboard background.** the architecture names the difference between *should we speak* and *what do we say*.

**a coherent design system** that resists the default “ai slop” look while still being implementable in tailwind and motion.

**developer ergonomics** where it matters: typed error envelopes from the API, a clear separation between the stateless orchestrator and the route that owns auth and persistence.

---

## What we learned

**the product is the pipeline.** anthropic, mathpix, ocr, predictive—each is a capability. the “thing” is the orchestration that takes pixels plus history and returns one accountable decision per tick.

**the last mile is UX and trust.** students need to understand *why* something happened, especially when the tutor is silent. building toward replay and explicit suppression reasons is part of the same story as “good pedagogy”.

**memory without receipts is a toy.** the graph and upload flow exist because longitudinal tutoring without grounding eventually collapses into generic advice.

---

## What’s next for ione

**tighter product polish on the desk** so every surface, including system feedback, matches the notebook aesthetic end to end.

**deeper session intelligence** on top of the cycles and hints—patterns over time, stronger struggle summaries, and more explainable “we stayed quiet because …” in the main UI, not only in internal traces.

**richer source ingestion** so the archivist and graph extraction paths continue to pay off in the tutor’s sidebar and dashboard, with fewer manual touch points.

**harder real world validation** in classrooms and at home, especially around capture quality, accessibility, and when *not* to interrupt.

---

## Notes for paste into Devpost

- Devpost sometimes strips or mangles markdown; keep a plain backup in notes if something looks off after paste.
- Trim sections to fit character limits; “What it does” and “How we built it” are usually the first to cut.
- If the submission wants title case section headers, you can run a pass on headings only; the body can stay in your chosen voice.
