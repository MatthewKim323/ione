#!/usr/bin/env node
/**
 * Consolidate the two JSON eval reports written by the orchestrator and KG
 * extractor tests (api/.eval/orchestrator.json + api/.eval/kg.json) into a
 * single human-readable summary at `api/.eval/summary.md`.
 *
 * Run after `pnpm eval`. Exits 0 even if a report is missing — we just
 * skip that section so the script is safe to run before either suite has
 * landed in a fresh checkout.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const ORCH_PATH = join(ROOT, "api", ".eval", "orchestrator.json");
const KG_PATH = join(ROOT, "api", ".eval", "kg.json");
const OUT_PATH = join(ROOT, "api", ".eval", "summary.md");

function load(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`failed to parse ${path}:`, err.message);
    return null;
  }
}

const orch = load(ORCH_PATH);
const kg = load(KG_PATH);

if (!orch && !kg) {
  console.error(
    "No eval reports found. Run `pnpm eval` first (it writes to api/.eval/).",
  );
  process.exit(1);
}

const lines = [];
lines.push("# Margin AI Tutor — eval summary");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push("");

let grandUsd = 0;
let grandMs = 0;
let grandScenarios = 0;

if (orch) {
  lines.push("## Orchestrator (15 scenarios)");
  lines.push("");
  lines.push("| Scenario | Category | ms | USD | Verdicts |");
  lines.push("|---|---|---:|---:|---|");
  for (const s of orch.scenarios) {
    const verdicts = s.cycles
      .map((c) => c.verdict.replace("speak_", "→"))
      .join(", ");
    lines.push(
      `| \`${s.scenario_id}\` | ${s.category} | ${s.total_ms} | $${s.total_usd.toFixed(4)} | ${verdicts} |`,
    );
  }
  lines.push("");
  lines.push(
    `**Totals:** ${orch.totals.scenarios} scenarios, ${orch.totals.ms}ms, $${orch.totals.usd.toFixed(4)}`,
  );
  lines.push("");
  grandUsd += orch.totals.usd;
  grandMs += orch.totals.ms;
  grandScenarios += orch.totals.scenarios;
}

if (kg) {
  lines.push("## KG extractors (4 scenarios)");
  lines.push("");
  lines.push("| Scenario | Extractor | Claims | Errors | ms | USD |");
  lines.push("|---|---|---:|---:|---:|---:|");
  for (const s of kg.scenarios) {
    lines.push(
      `| \`${s.scenarioId}\` | ${s.extractor} | ${s.claimCount} | ${s.errorCount} | ${s.ms} | $${s.usd.toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push(
    `**Totals:** ${kg.totals.scenarios} scenarios, ${kg.totals.ms}ms, $${kg.totals.usd.toFixed(4)}`,
  );
  lines.push("");
  grandUsd += kg.totals.usd;
  grandMs += kg.totals.ms;
  grandScenarios += kg.totals.scenarios;
}

lines.push("---");
lines.push("");
lines.push(
  `**Grand total:** ${grandScenarios} scenarios across ${grandMs}ms ≈ $${grandUsd.toFixed(4)}`,
);
lines.push("");

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, lines.join("\n"));

console.log(lines.join("\n"));
console.log(`\nWrote ${OUT_PATH}`);
