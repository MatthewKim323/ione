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
    // Salvage path. Truncation (max_tokens hit) leaves a structurally
    // invalid JSON like `{ "claims": [ {...}, {...partial` and we lose
    // every successfully-emitted claim. We try to recover the prefix by:
    //   1. find the start of the `claims` array
    //   2. walk to the last `}` that closes a top-level claim entry
    //      (i.e. the nearest `},` or `}` followed by `]`)
    //   3. close the array + object explicitly
    // We only do this if the raw clearly LOOKS like a truncated extractor
    // payload so we don't paper over real bugs.
    const salvage = trySalvageTruncatedClaims<T>(stripped);
    if (salvage) return salvage;

    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      raw,
    };
  }
}

function trySalvageTruncatedClaims<T>(stripped: string): ParseResult<T> | null {
  const claimsAt = stripped.indexOf('"claims"');
  if (claimsAt < 0) return null;
  const arrayStart = stripped.indexOf("[", claimsAt);
  if (arrayStart < 0) return null;

  // Walk the array, depth-counting braces inside string literals safely,
  // recording every position where depth returns to 0 right after a `}`.
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastSafeClose = -1;
  for (let i = arrayStart + 1; i < stripped.length; i += 1) {
    const ch = stripped[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) lastSafeClose = i; // end of one claim object
    }
    else if (ch === "]" && depth === 0) {
      // array already complete — let the original parser handle it
      return null;
    }
  }

  if (lastSafeClose < 0) return null;

  // Reconstruct: keep everything up to + including the last full claim,
  // then close the array and the outer object.
  const prefix = stripped.slice(0, lastSafeClose + 1);
  const repaired = `${prefix}]}`;
  try {
    const value = JSON.parse(repaired) as T;
    return { ok: true, value };
  } catch {
    return null;
  }
}
