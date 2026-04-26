import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load env from the repo-root .env.local first (where ANTHROPIC / MATHPIX /
// SUPABASE_SERVICE_ROLE_KEY already live), then fall back to api/.env.local
// for any api-specific overrides. This keeps a single source of truth.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
dotenvConfig({ path: resolve(repoRoot, ".env.local") });
dotenvConfig({ path: resolve(repoRoot, "api/.env.local"), override: true });

// Comma-separated origin list, with sensible defaults for local dev.
const ALLOWED_ORIGIN_DEFAULT = [
  "http://localhost:5234",
  "http://localhost:4173",
  "http://127.0.0.1:5234",
  "http://127.0.0.1:4173",
].join(",");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  ALLOWED_ORIGINS: z.string().default(ALLOWED_ORIGIN_DEFAULT),

  // Anthropic — required (every agent uses it)
  ANTHROPIC_API_KEY: z.string().min(10, "ANTHROPIC_API_KEY missing"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),

  // Mathpix — required for OCR
  MATHPIX_APP_ID: z.string().min(1, "MATHPIX_APP_ID missing"),
  MATHPIX_APP_KEY: z.string().min(1, "MATHPIX_APP_KEY missing"),

  // Supabase — server-side admin client
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(10, "SUPABASE_SERVICE_ROLE_KEY missing"),

  // ElevenLabs — optional (audio is a phase-2 stretch; intervention can run text-only)
  ELEVENLABS_API_KEY: z.string().optional(),
  // ione tutor voice. Override via ELEVENLABS_VOICE_ID in .env.local.
  ELEVENLABS_VOICE_ID: z.string().default("jqcCZkN6Knx8BJ5TBdYR"),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_flash_v2_5"),

  // Loop-contract guardrails
  COST_CAP_USD_PER_SESSION: z.coerce.number().positive().default(1.5),
  COST_CAP_USD_PER_USER_DAY: z.coerce.number().positive().default(5),
  COST_CAP_USD_BUILD: z.coerce.number().positive().default(8),

  // Behavior toggles
  STORE_FRAMES: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  RUN_EVAL: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  · ${i.path.join(".") || "(root)"} — ${i.message}`)
      .join("\n");
    // Logger isn't loaded yet — bail noisily on stdout.
    // eslint-disable-next-line no-console
    console.error(`\n[env] invalid configuration:\n${issues}\n`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
