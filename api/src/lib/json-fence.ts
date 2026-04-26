/**
 * Sonnet — even when the prompt forbids it — sometimes wraps JSON in
 * ```json fences. Same defensive parser pattern we proved out in
 * scripts/test-ocr.mjs and scripts/test-predictive.mjs.
 */
export function stripJsonFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; raw: string };

/** Parse Sonnet's text output as JSON, with fence stripping. */
export function parseJsonResponse<T>(raw: string): ParseResult<T> {
  const stripped = stripJsonFences(raw);
  try {
    return { ok: true, value: JSON.parse(stripped) as T };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      raw,
    };
  }
}
