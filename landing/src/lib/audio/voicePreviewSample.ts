/**
 * Builds a short mono WAV so we can preview the shared <audio> + wisp orb
 * without calling the TTS API. Sounds like a soft breathy hum — enough
 * energy for the analyser to move the shader.
 */
export function createVoicePreviewWavUrl(): string {
  const sampleRate = 22050;
  const seconds = 2.35;
  const n = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.sin((i / Math.max(1, n - 1)) * Math.PI);
    const hum =
      Math.sin(2 * Math.PI * 162 * t) * 0.055 +
      Math.sin(2 * Math.PI * 241 * t) * 0.032;
    const noise = (Math.random() * 2 - 1) * 0.1;
    const wobble = 0.62 + Math.sin(2 * Math.PI * 5.5 * t) * 0.12;
    samples[i] = (hum + noise) * env * wobble;
  }
  const blob = encodeWavMono16(samples, sampleRate);
  return URL.createObjectURL(blob);
}

function encodeWavMono16(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i)!);
  }
}
