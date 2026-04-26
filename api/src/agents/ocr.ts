/**
 * OCR / Page-Understanding Agent (AGENT_PROMPTS §1).
 *
 * Two-step pipeline:
 *   1. Mathpix v3/text gives us machine-grade LaTeX of every equation on the page.
 *   2. Sonnet vision call interprets layout, identifies which problem the
 *      student is working, and returns the structured page state.
 *
 * Mathpix is a hard dep — its LaTeX is what we hand to Reasoning. The Sonnet
 * call adds layout/intent/page_state on top.
 */

import { mathpixText, type MathpixResult } from "../integrations/mathpix.js";
import { sonnetVisionJson } from "../integrations/anthropic.js";
import { OCR_AGENT_SYSTEM } from "./prompts.js";
import type { OcrOutput } from "./types.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import type { CycleCost } from "../lib/cost.js";

export type OcrAgentResult = {
  output: OcrOutput;
  mathpix: MathpixResult;
  sonnet: {
    raw: string;
    usd: number;
    ms: number;
    input_tokens: number;
    output_tokens: number;
  };
};

export type OcrAgentInput = {
  /** Raw bytes of the captured WebP frame. */
  frameWebpBase64: string;
  /** Optional cost accumulator for the cycle. */
  cost?: CycleCost;
};

/**
 * Run OCR on a single frame. Failures in either provider are surfaced as
 * `AppError("upstream_error")` so the orchestrator can decide whether to mark
 * the cycle low_confidence and continue, or abort.
 */
export async function runOcrAgent(input: OcrAgentInput): Promise<OcrAgentResult> {
  const mp = await mathpixText(input.frameWebpBase64);
  input.cost?.add("mathpix", mp.usd);

  const userPayload = [
    "## Mathpix LaTeX (trust this for math content)",
    mp.latex || "(empty)",
    "",
    "## Mathpix raw confidence",
    String(mp.confidence ?? "n/a"),
    "",
    "## Image",
    "(see attached)",
  ].join("\n");

  // 1600 tokens (was 700). The OCR agent has to return the full
  // problem_text plus an array of every completed step's LaTeX — on a
  // dense page with 5+ equations that easily blew past 700, causing
  // Sonnet to truncate mid-JSON and the parser to silently drop
  // completed_steps_latex. Symptom in the wild: "ocr read x=3 with 40%
  // conf" even though the iPad page had a whole sequence of derivations.
  const sonnet = await sonnetVisionJson<OcrOutput>({
    system: OCR_AGENT_SYSTEM,
    imageBase64: input.frameWebpBase64,
    imageMediaType: "image/webp",
    textBefore: userPayload,
    cacheSystem: true,
    maxTokens: 1600,
  });
  input.cost?.add("ocr_sonnet", sonnet.usd);

  if (!sonnet.parsed.ok) {
    logger.warn(
      { raw: sonnet.raw.slice(0, 200), err: sonnet.parsed.error },
      "ocr agent produced unparsable JSON",
    );
    throw new AppError("agent_parse_error", "ocr agent JSON parse failed", {
      details: { raw: sonnet.raw.slice(0, 500) },
    });
  }

  const out = normalizeOcrOutput(sonnet.parsed.value);

  return {
    output: out,
    mathpix: mp,
    sonnet: {
      raw: sonnet.raw,
      usd: sonnet.usd,
      ms: sonnet.ms,
      input_tokens: sonnet.usage.input_tokens,
      output_tokens: sonnet.usage.output_tokens,
    },
  };
}

/**
 * Defensively shape Sonnet's output. The prompt forbids missing fields, but
 * the orchestrator must never crash on the unhappy path.
 */
function normalizeOcrOutput(raw: Partial<OcrOutput>): OcrOutput {
  return {
    problem_text: typeof raw.problem_text === "string" ? raw.problem_text : null,
    current_step_latex:
      typeof raw.current_step_latex === "string" ? raw.current_step_latex : null,
    completed_steps_latex: Array.isArray(raw.completed_steps_latex)
      ? raw.completed_steps_latex.filter((s): s is string => typeof s === "string")
      : [],
    is_blank_page: Boolean(raw.is_blank_page ?? false),
    has_diagram: Boolean(raw.has_diagram ?? false),
    scratch_work_present: Boolean(raw.scratch_work_present ?? false),
    page_state:
      raw.page_state === "fresh_problem" ||
      raw.page_state === "in_progress" ||
      raw.page_state === "near_complete" ||
      raw.page_state === "stalled_or_stuck"
        ? raw.page_state
        : "in_progress",
    confidence:
      typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
        ? raw.confidence
        : 0.5,
  };
}
