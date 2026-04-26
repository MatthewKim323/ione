import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import { parseJsonResponse, type ParseResult } from "../lib/json-fence.js";
import { priceSonnetUsage } from "../lib/cost.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export type SonnetUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type SonnetResult<T> = {
  parsed: ParseResult<T>;
  raw: string;
  usage: SonnetUsage;
  usd: number;
  ms: number;
  model: string;
};

/**
 * Single-turn JSON-mode call. The agent prompts in this codebase all forbid
 * markdown fences, but Sonnet sometimes adds them anyway — `parseJsonResponse`
 * strips them defensively.
 */
export async function sonnetJson<T>(opts: {
  system: string;
  /** Either a plain string user message or full content blocks (e.g. with image). */
  user: string | Anthropic.MessageParam["content"];
  maxTokens?: number;
  model?: string;
  /** Anthropic message-cache breakpoint count (set to 1 for system prompt). */
  cacheSystem?: boolean;
}): Promise<SonnetResult<T>> {
  const t0 = performance.now();
  const model = opts.model ?? env.ANTHROPIC_MODEL;
  const userContent: Anthropic.MessageParam["content"] =
    typeof opts.user === "string"
      ? [{ type: "text", text: opts.user }]
      : opts.user;

  let resp: Anthropic.Message;
  try {
    resp = await getClient().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.cacheSystem
        ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
        : opts.system,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg, model }, "anthropic call failed");
    throw new AppError("upstream_error", `anthropic: ${msg}`, { cause: e });
  }
  const ms = performance.now() - t0;

  const text =
    resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n") ?? "";

  const usage: SonnetUsage = {
    input_tokens: resp.usage?.input_tokens ?? 0,
    output_tokens: resp.usage?.output_tokens ?? 0,
  };

  return {
    parsed: parseJsonResponse<T>(text),
    raw: text,
    usage,
    usd: priceSonnetUsage(usage),
    ms,
    model,
  };
}

/**
 * Vision call helper. The image is base64-encoded WebP per the production
 * capture path established in scripts/test-ocr.mjs.
 */
export async function sonnetVisionJson<T>(opts: {
  system: string;
  imageBase64: string;
  imageMediaType?: "image/webp" | "image/png" | "image/jpeg";
  textBefore?: string;
  textAfter?: string;
  maxTokens?: number;
  model?: string;
  cacheSystem?: boolean;
}): Promise<SonnetResult<T>> {
  const blocks: Anthropic.MessageParam["content"] = [];
  if (opts.textBefore) blocks.push({ type: "text", text: opts.textBefore });
  blocks.push({
    type: "image",
    source: {
      type: "base64",
      media_type: opts.imageMediaType ?? "image/webp",
      data: opts.imageBase64,
    },
  });
  if (opts.textAfter) blocks.push({ type: "text", text: opts.textAfter });

  return sonnetJson<T>({
    system: opts.system,
    user: blocks,
    maxTokens: opts.maxTokens ?? 1024,
    model: opts.model ?? env.ANTHROPIC_MODEL,
    cacheSystem: opts.cacheSystem ?? false,
  });
}
