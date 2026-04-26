/**
 * Intervention Agent (AGENT_PROMPTS §3) — the demo-critical one.
 *
 * Decides WHETHER to speak and WHAT to say, given:
 *   - the reasoning agent's verdict for this cycle
 *   - the student's struggle profile (longitudinal memory)
 *   - the recent intervention history (cooldown + dedup)
 *
 * The full decision logic lives in policy.ts (deterministic). This agent
 * runs after policy says "speak" — it's responsible for the *voice*.
 *
 * Per the prompt: bias hard toward silence. Long monologues are violence.
 */

import { sonnetJson } from "../integrations/anthropic.js";
import {
  INTERVENTION_AGENT_SYSTEM,
  INTERVENTION_AGENT_EXPLAIN_SYSTEM,
} from "./prompts.js";
import type {
  InterventionOutput,
  ReasoningOutput,
  StruggleProfile,
} from "./types.js";
import type { HintType } from "../lib/sse.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import type { CycleCost } from "../lib/cost.js";

export type InterventionAgentInput = {
  reasoning: ReasoningOutput;
  recentHints: string[];
  cooldownActive: boolean;
  isStalled: boolean;
  struggleProfile: StruggleProfile | null;
  cost?: CycleCost;
  /**
   * When set to "explain", we swap the autonomous Socratic prompt for
   * the EXPLAIN-mode prompt. The student pressed "I need help" — we
   * stop hinting and start teaching. Cooldown / dedup all bypassed by
   * the orchestrator before this is called.
   */
  assistanceMode?: "explain";
};

export type InterventionAgentResult = {
  output: InterventionOutput;
  raw: string;
  usd: number;
  ms: number;
};

const HINT_TYPES: HintType[] = [
  "error_callout",
  "scaffolding_question",
  "encouragement",
  "redirect",
  "explanation",
];

export async function runInterventionAgent(
  input: InterventionAgentInput,
): Promise<InterventionAgentResult> {
  const profileBlock = input.struggleProfile
    ? formatProfile(input.struggleProfile)
    : "(no longitudinal profile available)";

  const isExplain = input.assistanceMode === "explain";

  // Explain-mode user payload skips the "cooldown active / is stalled"
  // signals — they're irrelevant when the student explicitly asked for
  // help — and instead frames the request directly. Less context for
  // Sonnet to second-guess itself with.
  const userPayload = isExplain
    ? [
        "## Student request",
        "The student pressed the \"I need help\" button. Walk them through the next step (or finish the problem if they're nearly done). Do not hold back — they already had hints.",
        "",
        "## Reasoning (current frame)",
        JSON.stringify(input.reasoning, null, 2),
        "",
        "## Recent hints (do not repeat verbatim, but you may build on them)",
        input.recentHints.length
          ? JSON.stringify(input.recentHints, null, 2)
          : "[]",
        "",
        "## Struggle profile",
        profileBlock,
      ].join("\n")
    : [
        "## Reasoning",
        JSON.stringify(input.reasoning, null, 2),
        "",
        "## Recent hints",
        input.recentHints.length
          ? JSON.stringify(input.recentHints, null, 2)
          : "[]",
        "",
        "## Cooldown active",
        String(input.cooldownActive),
        "",
        "## Is stalled",
        String(input.isStalled),
        "",
        "## Struggle profile",
        profileBlock,
      ].join("\n");

  const sonnet = await sonnetJson<InterventionOutput>({
    system: isExplain
      ? INTERVENTION_AGENT_EXPLAIN_SYSTEM
      : INTERVENTION_AGENT_SYSTEM,
    user: userPayload,
    // Explain-mode walkthroughs run longer — 2 to 6 sentences plus
    // multi-line LaTeX. Bump tokens so the JSON doesn't truncate
    // mid-sentence (causing parse errors and angry users).
    maxTokens: isExplain ? 900 : 400,
    cacheSystem: true,
  });
  input.cost?.add("intervention", sonnet.usd);

  if (!sonnet.parsed.ok) {
    logger.warn(
      { raw: sonnet.raw.slice(0, 200), err: sonnet.parsed.error },
      "intervention agent JSON parse failed",
    );
    throw new AppError(
      "agent_parse_error",
      "intervention JSON parse failed",
      { details: { raw: sonnet.raw.slice(0, 500) } },
    );
  }

  const out = normalize(sonnet.parsed.value, { isExplain });
  return { output: out, raw: sonnet.raw, usd: sonnet.usd, ms: sonnet.ms };
}

function formatProfile(p: StruggleProfile): string {
  return [
    `Pattern summary: ${p.pattern_summary}`,
    `Error type: ${p.error_type}`,
    `Frequency: ${p.frequency}`,
    `Tutor notes: ${p.tutor_notes}`,
  ].join("\n");
}

function normalize(
  raw: Partial<InterventionOutput>,
  opts: { isExplain: boolean },
): InterventionOutput {
  // In explain-mode, should_speak is forced true regardless of what the
  // model returns — the user pressed the button. Same for hint_type.
  const should = opts.isExplain ? true : Boolean(raw.should_speak ?? false);
  let hintType: HintType | null =
    raw.hint_type === null || raw.hint_type === undefined
      ? null
      : HINT_TYPES.includes(raw.hint_type as HintType)
        ? (raw.hint_type as HintType)
        : null;
  if (opts.isExplain) hintType = "explanation";

  return {
    should_speak: should,
    hint_text:
      should && typeof raw.hint_text === "string" && raw.hint_text.trim()
        ? raw.hint_text.trim()
        : null,
    hint_type: should ? hintType : null,
    memory_to_write:
      typeof raw.memory_to_write === "string" && raw.memory_to_write.trim()
        ? raw.memory_to_write.trim()
        : null,
    reasoning_for_decision:
      typeof raw.reasoning_for_decision === "string"
        ? raw.reasoning_for_decision
        : "",
  };
}
