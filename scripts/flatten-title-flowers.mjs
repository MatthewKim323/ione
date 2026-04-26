/**
 * One-off: white line art on black → white on transparent (alpha = luminance).
 * Run: node scripts/flatten-title-flowers.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const input = join(__dirname, "../landing/public/title-page-flowers.png");
const output = join(__dirname, "../landing/public/title-page-flowers.png");

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const ch = info.channels; // 3 or 4
const out = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) {
  const s = i * ch;
  const r = data[s] ?? 0;
  const g = data[s + 1] ?? 0;
  const b = data[s + 2] ?? 0;
  const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const o = i * 4;
  if (lum < 8) {
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = 0;
  } else {
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = Math.min(255, lum);
  }
}

await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .png()
  .toFile(output);

console.log("Wrote", output, w + "x" + h);
