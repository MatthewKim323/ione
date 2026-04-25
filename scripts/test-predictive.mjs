#!/usr/bin/env node
/**
 * test-predictive.mjs — Predictive Risk Agent harness.
 *
 * Hand-feeds the three fixture JSONs (demo problem, struggle profile, trajectory)
 * + the agent system prompt to Claude Sonnet, then prints the prediction with
 * a Demo Readiness assessment that flags whether the model's `basis` actually
 * grounds itself in the struggle profile (PASS) or is generic (TUNE).
 *
 * Why this script exists: the predictive hint is the demo opener. We need to
 * confirm the prompt produces a confident, profile-anchored prediction at
 * stage_3 (and ideally stage_2) on the demo problem before any UI gets wired.
 * If basis is generic on the real fixtures, the prompt or the profile shape
 * needs tuning — better to find out here than on stage.
 *
 * Usage:
 *   node scripts/test-predictive.mjs                 # uses trajectory.json as-is
 *   node scripts/test-predictive.mjs --stage 1       # forces stage_1 trajectory
 *   node scripts/test-predictive.mjs --stage 2       # forces stage_2 trajectory
 *   node scripts/test-predictive.mjs --stage 3       # forces stage_3 trajectory
 *
 * --stage N first tries scripts/fixtures/trajectory-stage-N.json; if missing,
 * falls back to trajectory.json with the `stage` field overridden to stage_N.
 *
 * Requires: ANTHROPIC_API_KEY in .env.local
 */

import { readFile, access } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { config as dotenvConfig } from "dotenv";

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

// ── Arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { stageOverride: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stage") {
      const n = argv[++i];
      if (!/^[1-3]$/.test(String(n))) {
        throw new Error(`--stage expects 1, 2, or 3 (got ${JSON.stringify(n)})`);
      }
      out.stageOverride = `stage_${n}`;
    } else if (a.startsWith("--stage=")) {
      const n = a.split("=")[1];
      if (!/^[1-3]$/.test(String(n))) {
        throw new Error(`--stage expects 1, 2, or 3 (got ${JSON.stringify(n)})`);
      }
      out.stageOverride = `stage_${n}`;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return out;
}

// ── Fixture loading ────────────────────────────────────────────────────────
const fixtureUrl = (name) => new URL(`./fixtures/${name}`, import.meta.url);

async function fileExists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(name) {
  const buf = await readFile(fixtureUrl(name), "utf8");
  try {
    return JSON.parse(buf);
  } catch (e) {
    throw new Error(`fixtures/${name} is not valid JSON: ${e.message}`);
  }
}

async function loadTrajectory(stageOverride) {
  // If --stage N was passed, prefer trajectory-stage-N.json; else fall back.
  if (stageOverride) {
    const n = stageOverride.split("_")[1];
    const stagedName = `trajectory-stage-${n}.json`;
    if (await fileExists(fixtureUrl(stagedName))) {
      const t = await loadJson(stagedName);
      // Force the stage field to match in case the staged file disagrees.
      t.stage = stageOverride;
      return { trajectory: t, source: stagedName };
    }
    const t = await loadJson("trajectory.json");
    t.stage = stageOverride;
    return { trajectory: t, source: `trajectory.json (stage forced to ${stageOverride})` };
  }
  return { trajectory: await loadJson("trajectory.json"), source: "trajectory.json" };
}

// ── Demo Readiness heuristic ───────────────────────────────────────────────
// PASS if predicted_error.basis substring-matches any meaningful phrase from
// pattern_summary or examples[].what_went_wrong (case-insensitive). The point
// is to detect generic predictions ("might make a sign error") vs grounded
// ones ("based on the prior pattern of dropping negative signs at bound
// evaluation"). This is heuristic — main thread can swap in a stricter check.
function extractPhrases(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  return text
    .split(/[.,;:!?\n\(\)\[\]]+|\s+\b(?:and|or|but|when|because|due to)\b\s+/i)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length >= 8 && /[a-z]{4,}/.test(p));
}

function assessDemoReadiness(parsed, struggleProfile) {
  const basis = parsed?.predicted_error?.basis;
  if (typeof basis !== "string" || !basis.trim()) {
    return { verdict: "TUNE", reason: "no `basis` string in agent output", matched: null };
  }
  const haystack = basis.toLowerCase();
  const phrases = [
    ...extractPhrases(struggleProfile?.pattern_summary),
    ...(Array.isArray(struggleProfile?.examples)
      ? struggleProfile.examples.flatMap((e) => extractPhrases(e?.what_went_wrong))
      : []),
  ];
  for (const p of phrases) {
    if (haystack.includes(p)) {
      return { verdict: "PASS", reason: "basis grounded in struggle profile", matched: p };
    }
  }
  return {
    verdict: "TUNE",
    reason:
      phrases.length === 0
        ? "no matchable phrases in struggle profile (stub or empty?)"
        : "basis is generic — no overlap with struggle profile phrases",
    matched: null,
  };
}

// ── Anthropic call ─────────────────────────────────────────────────────────
function buildUserMessage(demoProblem, struggleProfile, trajectory) {
  return [
    "Predictive Risk Agent — input bundle for this cycle.",
    "",
    "## Demo Problem",
    "```json",
    JSON.stringify(demoProblem, null, 2),
    "```",
    "",
    "## Struggle Profile",
    "```json",
    JSON.stringify(struggleProfile, null, 2),
    "```",
    "",
    "## Trajectory",
    "```json",
    JSON.stringify(trajectory, null, 2),
    "```",
    "",
    "Return JSON only — the schema specified in the system prompt. No prose, no code fences.",
  ].join("\n");
}

async function callPredictive(systemPrompt, userMessage) {
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
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const elapsedMs = performance.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }
  const json = await res.json();
  const text = json.content?.[0]?.text ?? "";
  // Defensive: strip markdown code fences if the model adds them despite the
  // prompt. Same parser pattern as test-ocr.mjs — Sonnet has been observed
  // wrapping JSON in ```json fences even when the prompt forbids it.
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

// ── Render helpers ─────────────────────────────────────────────────────────
function fmtConfidence(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return c.dim("(n/a)");
  const pct = (n * 100).toFixed(0) + "%";
  if (n >= 0.7) return c.moss(pct);
  if (n >= 0.5) return c.yellow(pct);
  return c.dim(pct);
}

function wrap(text, width = 68, indent = "    ") {
  if (typeof text !== "string") return indent + c.dim(String(text));
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l) => indent + l).join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(c.red("\nMissing env var: ANTHROPIC_API_KEY"));
    console.error(c.dim("Copy .env.local.example to .env.local and fill it in.\n"));
    process.exit(1);
  }

  let args;
  try {
    args = parseArgs(process.argv);
  } catch (e) {
    console.error(c.red(`\n${e.message}`));
    console.error(c.dim("Usage: node scripts/test-predictive.mjs [--stage 1|2|3]\n"));
    process.exit(1);
  }
  if (args.help) {
    console.log("Usage: node scripts/test-predictive.mjs [--stage 1|2|3]");
    process.exit(0);
  }

  // Load fixtures
  const [demoProblem, struggleProfile, prompt, traj] = await Promise.all([
    loadJson("demo-problem.json"),
    loadJson("struggle-profile.json"),
    readFile(fixtureUrl("predictive-prompt.txt"), "utf8"),
    loadTrajectory(args.stageOverride),
  ]);
  const trajectory = traj.trajectory;

  // Strip the `_stub` documentation key before sending — model shouldn't see
  // our scaffolding notes.
  const sanitize = (o) => {
    if (!o || typeof o !== "object") return o;
    const { _stub, ...rest } = o;
    return rest;
  };
  const demoForModel = sanitize(demoProblem);
  const profileForModel = sanitize(struggleProfile);
  const trajectoryForModel = sanitize(trajectory);

  // ── Header ──────────────────────────────────────────────────────────────
  console.log("");
  console.log(rule("MARGIN  ·  PREDICTIVE RISK AGENT HARNESS"));
  console.log(c.dim("  trajectory  ") + traj.source);
  console.log(c.dim("  stage       ") + c.cyan(trajectory.stage ?? "(unset)"));
  console.log(c.dim("  problem     ") + (demoProblem.problem_text ?? c.dim("(none)")));
  console.log(c.dim("  prompt      ") + `${prompt.length} chars`);
  if (
    String(demoProblem.problem_text ?? "").includes("STUB") ||
    String(struggleProfile.pattern_summary ?? "").includes("STUB") ||
    prompt.includes("STUB")
  ) {
    console.log(c.yellow("  ⚠  one or more fixtures still contain STUB markers — output will be meaningless until main thread fills them in."));
  }

  // ── Fire the agent ──────────────────────────────────────────────────────
  console.log("");
  console.log(rule("claude sonnet 4.5 — predictive risk"));
  const userMessage = buildUserMessage(demoForModel, profileForModel, trajectoryForModel);
  let result;
  try {
    result = await callPredictive(prompt, userMessage);
  } catch (e) {
    console.log(c.red("  ERROR  ") + e.message);
    process.exit(1);
  }

  // ── Stage indicator ─────────────────────────────────────────────────────
  console.log("");
  console.log(rule("stage indicator"));
  console.log(c.dim("  tested at   ") + c.cyan(trajectory.stage ?? "(unset)"));
  if (Array.isArray(trajectory.student_work_so_far_latex) && trajectory.student_work_so_far_latex.length) {
    console.log(c.dim("  prior steps ") + trajectory.student_work_so_far_latex.length);
    trajectory.student_work_so_far_latex.forEach((s, i) =>
      console.log(c.dim(`    ${i + 1}. `) + s),
    );
  }
  if (trajectory.current_partial_step) {
    console.log(c.dim("  partial     ") + c.sienna(trajectory.current_partial_step));
  }
  if (typeof trajectory.time_on_problem_seconds === "number") {
    console.log(c.dim("  time        ") + `${trajectory.time_on_problem_seconds}s on problem`);
  }

  // ── Predicted error ─────────────────────────────────────────────────────
  console.log("");
  console.log(rule("predicted error"));
  if (!result.parsed) {
    console.log(c.yellow("  parse failed — raw output:"));
    console.log(result.raw);
    if (result.parseError) console.log(c.red(`  ${result.parseError}`));
  } else {
    const pe = result.parsed.predicted_error ?? {};
    console.log(c.dim("  type        ") + (pe.type ? c.bold(pe.type) : c.dim("(null)")));
    console.log(c.dim("  confidence  ") + fmtConfidence(pe.confidence));
    console.log(c.dim("  basis"));
    console.log(c.sienna(wrap(pe.basis ?? "(none)", 66, "    ")));
  }

  // ── Decision ────────────────────────────────────────────────────────────
  console.log("");
  console.log(rule("decision"));
  if (result.parsed) {
    const intervene = result.parsed.recommend_intervene;
    const label = intervene === true ? c.moss("INTERVENE") : intervene === false ? c.dim("HOLD") : c.yellow("(missing)");
    console.log(c.dim("  recommend   ") + label);
    console.log(c.dim("  reasoning"));
    console.log(wrap(result.parsed.reasoning ?? "(none)", 66, "    "));
  } else {
    console.log(c.dim("  (skipped — parse failed)"));
  }

  // ── Demo readiness ──────────────────────────────────────────────────────
  console.log("");
  console.log(rule("demo readiness"));
  if (result.parsed) {
    const r = assessDemoReadiness(result.parsed, struggleProfile);
    const badge = r.verdict === "PASS" ? c.moss(c.bold(" PASS ")) : c.yellow(c.bold(" TUNE "));
    console.log(c.dim("  verdict     ") + badge + "  " + c.dim(r.reason));
    if (r.matched) {
      console.log(c.dim("  matched     ") + c.moss(`"${r.matched}"`));
    }
    console.log(c.dim("  heuristic   ") + c.dim("basis ⊇ phrase from pattern_summary or examples[].what_went_wrong"));
  } else {
    console.log(c.dim("  (skipped — parse failed)"));
  }

  // ── Cycle metrics ───────────────────────────────────────────────────────
  console.log("");
  console.log(rule("cycle metrics"));
  console.log(c.dim("  latency     ") + c.cyan(`${result.elapsedMs.toFixed(0)}ms`));
  if (result.usage) {
    console.log(
      c.dim("  tokens      ") +
        `in ${result.usage.input_tokens} · out ${result.usage.output_tokens}`,
    );
  }
  console.log("");
  console.log(c.dim("  Run with --stage 1|2|3 to swap trajectories without editing fixtures."));
  console.log(c.dim("  See MARGIN_ULTIMATE_MASTER_PLAN.md §8.\n"));
}

main().catch((e) => {
  console.error(c.red("\nfatal: ") + e.message);
  process.exit(1);
});
