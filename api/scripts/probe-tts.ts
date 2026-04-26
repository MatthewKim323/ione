/**
 * Direct smoke test for the streamSpeech() fallback. Imports the integration
 * module verbatim so we exercise the exact code path the dashboard preview
 * + interventions go through.
 *
 *   npx tsx scripts/probe-tts.ts
 */
import { streamSpeech, elevenLabsConfigured } from "../src/integrations/elevenlabs.js";
import { env } from "../src/env.js";

async function main() {
  console.log("── ione · streamSpeech probe ─────────────────────");
  console.log("configured  :", elevenLabsConfigured());
  console.log("voice id    :", env.ELEVENLABS_VOICE_ID);
  console.log("model id    :", env.ELEVENLABS_MODEL_ID);
  console.log("");

  const handle = await streamSpeech(
    "hi — i'm ione. testing voice synthesis with fallback.",
  );

  console.log("voice used  :", handle.voiceId);
  console.log("fell back   :", handle.fellBack);
  console.log("est usd     :", handle.usd.toFixed(6));

  const reader = handle.stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/ione-tts-probe.mp3", buf);
  console.log("mp3 bytes   :", total);
  console.log("saved       : /tmp/ione-tts-probe.mp3 (open to confirm)");
  console.log("");
  if (handle.fellBack) {
    console.log(
      "→ configured voice was paywalled. fallback voice (Bella) was used.",
    );
    console.log(
      "  to unlock the configured voice, upgrade ElevenLabs to Starter ($5/mo).",
    );
  } else {
    console.log("→ configured voice synthesized successfully. no fallback used.");
  }
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exitCode = 1;
});
