#!/usr/bin/env node
/**
 * test-ocr.mjs — Hour 0 hardware reality check.
 *
 * Takes a screenshot of an iPad notebook (mirrored via QuickTime, or any image),
 * encodes it to WebP at q=0.7 (the production capture path), and fires both
 * Mathpix v3/text and Claude Sonnet vision in parallel. Prints the LaTeX,
 * the structured page-understanding JSON, file sizes, and per-stage latencies.
 *
 * The whole point: if this script can't read three different handwritten lines
 * correctly, the capture pipeline parameters change before any agent code is
 * written around them. See MARGIN_OFFICE_HOURS_DESIGN.md Phase 0.
 *
 * Usage:
 *   node scripts/test-ocr.mjs <path-to-image>
 *   node scripts/test-ocr.mjs                        # uses most recent screenshot on Desktop
 *
 * Requires: ANTHROPIC_API_KEY, MATHPIX_APP_ID, MATHPIX_APP_KEY in .env.local
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename, extname } from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import { config as dotenvConfig } from "dotenv";

// Load .env.local first (Next.js convention), then fall back to .env
dotenvConfig({ path: new URL("../.env.local", import.meta.url).pathname });
dotenvConfig({ path: new URL("../.env", import.meta.url).pathname });

// ── ANSI colors (no chalk dep) ──────────────────────────────────────────────
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  ink: (s) => `\x1b[38;5;234m${s}\x1b[0m`,
  sienna: (s) => `\x1b[38;5;130m${s}\x1b[0m`,
  moss: (s) => `\x1b[38;5;65m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

const rule = (label = "") => {
  const w = 72;
  if (!label) return c.dim("─".repeat(w));
  const left = c.dim("── ");
  const right = c.dim(" " + "─".repeat(Math.max(0, w - 4 - label.length)));
  return left + c.bold(label) + right;
};

// ── OCR system prompt (verbatim from AGENT_PROMPTS.md §1) ──────────────────
const OCR_SYSTEM_PROMPT = `You are a visual analyzer for a math tutoring system. Your only job is to look at a screenshot of a student's notebook page and extract structured facts about what they are doing right now.

You will receive:
1. A screenshot of the student's current page
2. A LaTeX transcription of any math equations on the page (from a specialized OCR service — trust this for the actual math content, use the image only for layout and context)

You must output a single JSON object with these fields and NOTHING else. No prose, no markdown, no code fences.

{
  "problem_text": string | null,
  "current_step_latex": string | null,
  "completed_steps_latex": string[],
  "is_blank_page": boolean,
  "has_diagram": boolean,
  "scratch_work_present": boolean,
  "page_state": "fresh_problem" | "in_progress" | "near_complete" | "stalled_or_stuck",
  "confidence": number
}

Rules:
- The LaTeX OCR is more accurate than your own reading of equations. Use it.
- If the LaTeX OCR seems wrong, lower the confidence score.
- Do not interpret what the student should do next.
- Do not evaluate correctness.
- Output JSON only. Any other output breaks the system.`;

// ── Find the most recent screenshot on Desktop (incl. one level of subfolders) ──
async function findLatestScreenshot() {
  const desktop = join(homedir(), "Desktop");
  const imgRe = /\.(png|jpe?g|heic|webp)$/i;
  const screenshotNameHint = /screenshot|screen[\s_-]?shot/i;
  const candidates = [];

  const entries = await readdir(desktop, { withFileTypes: true });
  for (const e of entries) {
    const full = join(desktop, e.name);
    if (e.isFile() && imgRe.test(e.name)) {
      candidates.push(full);
    } else if (e.isDirectory()) {
      try {
        const sub = await readdir(full);
        for (const f of sub) if (imgRe.test(f)) candidates.push(join(full, f));
      } catch {}
    }
  }
  if (candidates.length === 0) return null;

  const stamped = await Promise.all(
    candidates.map(async (p) => {
      const s = await stat(p);
      return { p, mtime: s.mtimeMs, isScreenshot: screenshotNameHint.test(basename(p)) };
    }),
  );
  // Prefer files literally named "Screenshot ...", then fall back to most recent image.
  const screenshotsOnly = stamped.filter((x) => x.isScreenshot);
  const pool = screenshotsOnly.length > 0 ? screenshotsOnly : stamped;
  pool.sort((a, b) => b.mtime - a.mtime);
  return pool[0].p;
}

// ── Stage 1: encode WebP at q=0.7 (production capture path) ────────────────
async function encodeWebp(imagePath) {
  const t0 = performance.now();
  const original = await readFile(imagePath);
  const webp = await sharp(original).webp({ quality: 70 }).toBuffer();
  const meta = await sharp(webp).metadata();
  return {
    webp,
    base64: webp.toString("base64"),
    originalBytes: original.length,
    webpBytes: webp.length,
    width: meta.width,
    height: meta.height,
    encodeMs: performance.now() - t0,
  };
}

// ── Stage 2: Mathpix v3/text ───────────────────────────────────────────────
async function callMathpix(base64Webp) {
  const t0 = performance.now();
  const res = await fetch("https://api.mathpix.com/v3/text", {
    method: "POST",
    headers: {
      app_id: process.env.MATHPIX_APP_ID,
      app_key: process.env.MATHPIX_APP_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      src: `data:image/webp;base64,${base64Webp}`,
      formats: ["text", "latex_styled"],
      math_inline_delimiters: ["$", "$"],
      rm_spaces: true,
    }),
  });
  const elapsedMs = performance.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mathpix ${res.status}: ${body}`);
  }
  const json = await res.json();
  return { ...json, elapsedMs };
}

// ── Stage 3: Claude Sonnet vision (uses production OCR system prompt) ──────
async function callSonnet(base64Webp, mathpixLatex) {
  const t0 = performance.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/webp", data: base64Webp },
            },
            {
              type: "text",
              text: `Mathpix LaTeX transcription:\n${mathpixLatex || "(empty)"}`,
            },
          ],
        },
      ],
    }),
  });
  const elapsedMs = performance.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }
  const json = await res.json();
  const text = json.content?.[0]?.text ?? "";
  // Defensive: strip markdown code fences if the model adds them despite the prompt.
  // Same parser will live in lib/agents/ocr.ts when we wire the production path.
  const stripped = text
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    parseError = e.message;
  }
  return { raw: text, parsed, parseError, usage: json.usage, elapsedMs };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const required = ["ANTHROPIC_API_KEY", "MATHPIX_APP_ID", "MATHPIX_APP_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(c.red(`\nMissing env vars: ${missing.join(", ")}`));
    console.error(c.dim("Copy .env.local.example to .env.local and fill them in.\n"));
    process.exit(1);
  }

  const argPath = process.argv[2];
  const imagePath = argPath || (await findLatestScreenshot());
  if (!imagePath) {
    console.error(c.red("\nNo image path given and no screenshot found on Desktop."));
    console.error(c.dim("Usage: node scripts/test-ocr.mjs <path-to-image>\n"));
    process.exit(1);
  }

  // Stat the image so we can flag stale auto-picks.
  const imageStat = await stat(imagePath);
  const ageMin = (Date.now() - imageStat.mtimeMs) / 60000;
  const ageStr = ageMin < 60 ? `${ageMin.toFixed(0)}m ago` : `${(ageMin / 60).toFixed(1)}h ago`;

  console.log("");
  console.log(rule("MARGIN  ·  OCR HARDWARE REALITY CHECK"));
  console.log(c.dim(`  image    `) + basename(imagePath));
  console.log(c.dim(`  path     `) + c.dim(imagePath));
  console.log(c.dim(`  format   `) + extname(imagePath).slice(1).toLowerCase() + c.dim(`   modified ${ageStr}`));
  if (!argPath && ageMin > 10) {
    console.log(c.yellow(`  ⚠  auto-picked an image ${ageStr} — pass an explicit path if this is wrong.`));
  }

  // Encode WebP
  console.log("");
  console.log(rule("stage 1 — encode webp q=0.7"));
  const enc = await encodeWebp(imagePath);
  const ratio = ((enc.webpBytes / enc.originalBytes) * 100).toFixed(1);
  console.log(c.dim("  size     ") + `${(enc.originalBytes / 1024).toFixed(1)} KB → ${c.moss((enc.webpBytes / 1024).toFixed(1) + " KB")} ${c.dim(`(${ratio}%)`)}`);
  console.log(c.dim("  pixels   ") + `${enc.width}×${enc.height}`);
  console.log(c.dim("  latency  ") + c.cyan(`${enc.encodeMs.toFixed(0)}ms`));

  // Fire Mathpix + Sonnet in parallel (this is the production cycle pattern)
  console.log("");
  console.log(rule("stage 2 — mathpix + sonnet (parallel)"));
  const mathpixPromise = callMathpix(enc.base64).catch((e) => ({ error: e.message }));
  const sonnetPromise = mathpixPromise.then((mp) =>
    callSonnet(enc.base64, mp.latex_styled || mp.text || "").catch((e) => ({ error: e.message })),
  );
  const [mathpix, sonnet] = await Promise.all([mathpixPromise, sonnetPromise]);

  // Mathpix result
  console.log("");
  console.log(rule("mathpix v3/text"));
  if (mathpix.error) {
    console.log(c.red("  ERROR  ") + mathpix.error);
  } else {
    console.log(c.dim("  latency  ") + c.cyan(`${mathpix.elapsedMs.toFixed(0)}ms`));
    console.log(c.dim("  conf     ") + (mathpix.confidence ?? "(n/a)"));
    console.log(c.dim("  latex    ") + c.sienna(mathpix.latex_styled || "(empty)"));
    if (mathpix.text && mathpix.text !== mathpix.latex_styled) {
      console.log(c.dim("  text     ") + mathpix.text);
    }
  }

  // Sonnet result
  console.log("");
  console.log(rule("claude sonnet 4.5 — page understanding"));
  if (sonnet.error) {
    console.log(c.red("  ERROR  ") + sonnet.error);
  } else {
    console.log(c.dim("  latency  ") + c.cyan(`${sonnet.elapsedMs.toFixed(0)}ms`));
    if (sonnet.usage) {
      console.log(
        c.dim("  tokens   ") + `in ${sonnet.usage.input_tokens} · out ${sonnet.usage.output_tokens}`,
      );
    }
    if (sonnet.parsed) {
      const p = sonnet.parsed;
      console.log(c.dim("  state    ") + c.moss(p.page_state ?? "?") + c.dim(`  conf ${p.confidence ?? "?"}`));
      console.log(c.dim("  problem  ") + (p.problem_text ?? c.dim("(none)")));
      console.log(c.dim("  current  ") + c.sienna(p.current_step_latex ?? "(none)"));
      if (p.completed_steps_latex?.length) {
        console.log(c.dim("  steps    ") + p.completed_steps_latex.length + c.dim(" prior"));
        p.completed_steps_latex.forEach((s, i) => console.log(c.dim(`    ${i + 1}. `) + s));
      }
      console.log(
        c.dim("  flags    ") +
          [
            p.is_blank_page && "blank",
            p.has_diagram && "diagram",
            p.scratch_work_present && "scratch",
          ]
            .filter(Boolean)
            .join(" · ") || c.dim("(none)"),
      );
    } else {
      console.log(c.yellow("  parse failed — raw output:"));
      console.log(sonnet.raw);
      if (sonnet.parseError) console.log(c.red(`  ${sonnet.parseError}`));
    }
  }

  // Cycle total
  console.log("");
  console.log(rule("cycle total"));
  const total = enc.encodeMs + Math.max(mathpix.elapsedMs ?? 0, sonnet.elapsedMs ?? 0);
  console.log(c.dim("  end-to-end ") + c.cyan(`${total.toFixed(0)}ms`) + c.dim("   (target ≤ 8000ms)"));
  console.log("");
  console.log(c.dim("  Run this on three different handwritten lines before writing any agent code."));
  console.log(c.dim("  See MARGIN_OFFICE_HOURS_DESIGN.md Phase 0.\n"));
}

main().catch((e) => {
  console.error(c.red("\nfatal: ") + e.message);
  process.exit(1);
});
