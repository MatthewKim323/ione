import { env } from "../env.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { MATHPIX_USD_PER_CALL } from "../lib/cost.js";

export type MathpixResult = {
  latex: string; // best LaTeX we got (latex_styled || text)
  text: string | null; // raw text field
  latex_styled: string | null;
  confidence: number | null;
  is_handwritten: boolean | null;
  raw: Record<string, unknown>;
  ms: number;
  usd: number;
};

/**
 * Mathpix v3/text — handwritten LaTeX OCR. Same call shape as
 * scripts/test-ocr.mjs. Returns a "best LaTeX" string convenient for the
 * downstream OCR agent prompt.
 */
export async function mathpixText(base64Webp: string): Promise<MathpixResult> {
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch("https://api.mathpix.com/v3/text", {
      method: "POST",
      headers: {
        app_id: env.MATHPIX_APP_ID,
        app_key: env.MATHPIX_APP_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        src: `data:image/webp;base64,${base64Webp}`,
        formats: ["text", "latex_styled"],
        math_inline_delimiters: ["$", "$"],
        rm_spaces: true,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg }, "mathpix fetch failed");
    throw new AppError("upstream_error", `mathpix: ${msg}`, { cause: e });
  }
  const ms = performance.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: body.slice(0, 200) }, "mathpix non-2xx");
    throw new AppError("upstream_error", `mathpix ${res.status}: ${body}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const latex_styled =
    typeof json.latex_styled === "string" ? json.latex_styled : null;
  const text = typeof json.text === "string" ? json.text : null;
  const confidence =
    typeof json.confidence === "number" ? json.confidence : null;
  const is_handwritten =
    typeof json.is_handwritten === "boolean" ? json.is_handwritten : null;

  return {
    latex: latex_styled || text || "",
    text,
    latex_styled,
    confidence,
    is_handwritten,
    raw: json,
    ms,
    usd: MATHPIX_USD_PER_CALL,
  };
}
