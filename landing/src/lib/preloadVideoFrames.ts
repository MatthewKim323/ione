/**
 * Sample N evenly spaced frames from a video into ImageBitmaps for smooth
 * scroll scrubbing (no runtime decode / seek in the <video> element).
 */
export type PreloadVideoFramesOptions = {
  /** Longest edge cap (preserves aspect). Lower = less memory & faster decode. */
  maxFrameWidth?: number;
  maxFrameHeight?: number;
  /** 0–1: skip the start of the clip when sampling. */
  trimStart?: number;
  /** 0–1: skip the end of the clip when sampling. */
  trimEnd?: number;
};

export async function preloadVideoFrames(
  src: string,
  count: number,
  options: PreloadVideoFramesOptions = {}
): Promise<{
  frames: ImageBitmap[];
  width: number;
  height: number;
}> {
  const {
    maxFrameWidth = 1280,
    maxFrameHeight = 720,
    trimStart = 0,
    trimEnd = 0,
  } = options;

  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("video load error")), {
      once: true,
    });
  });

  const duration = video.duration || 0;
  if (!duration) throw new Error("zero duration");

  const t0 = duration * Math.max(0, Math.min(1, trimStart));
  const t1 = duration * Math.max(0, Math.min(1, 1 - trimEnd));
  const span = Math.max(0, t1 - t0) || 0.001;

  const frames: ImageBitmap[] = [];
  const vw0 = video.videoWidth;
  const vh0 = video.videoHeight;
  if (!vw0 || !vh0) throw new Error("no video dimensions");

  const fitScale = Math.min(maxFrameWidth / vw0, maxFrameHeight / vh0, 1);
  const rw = Math.max(1, Math.round(vw0 * fitScale));
  const rh = Math.max(1, Math.round(vh0 * fitScale));
  const bitmapOpts: ImageBitmapOptions = { resizeWidth: rw, resizeHeight: rh };

  for (let i = 0; i < count; i++) {
    const t =
      count === 1 ? t0 : t0 + (i / (count - 1)) * span;
    await new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.currentTime = Math.min(t, duration - 0.001);
    });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const bitmap = await createImageBitmap(video, bitmapOpts);
    frames.push(bitmap);
  }

  return { frames, width: rw, height: rh };
}
