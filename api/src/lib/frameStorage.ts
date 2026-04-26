/**
 * Optional WebP frame archival for session replay (Phase 5 / R7).
 *
 * The orchestrator hands us the raw bytes of every cycle's frame. By default
 * (`STORE_FRAMES=0`) we throw them away — the OCR agent has already reduced
 * the page to LaTeX so the agents downstream don't need pixels. But the
 * dashboard's session replay (Phase 4 / G5) wants them back for the timeline
 * scrubber, otherwise every step shows a placeholder rectangle.
 *
 * When `STORE_FRAMES=1` we upload to a private Supabase storage bucket
 * (`tutor_frames`, created in 0005_session_frames_storage.sql) and return the
 * path so the route can persist it on the cycle row. The path layout is
 *
 *   <user_id>/<session_id>/<cycle_id>.webp
 *
 * which matches the bucket's RLS policy (`auth.uid()::text = (foldername)[1]`).
 */

import { Buffer } from "node:buffer";
import { env } from "../env.js";
import { supabaseAdmin } from "../integrations/supabase.js";
import { logger } from "./logger.js";

const BUCKET = "tutor_frames";

export interface MaybeStoreFrameOpts {
  userId: string;
  sessionId: string;
  cycleId: string;
  frameBase64: string;
}

/**
 * Upload the frame iff `STORE_FRAMES=1`. Always best-effort — a failed
 * upload must not break the cycle (the agents already ran on the in-memory
 * frame). Returns the storage path on success or null otherwise.
 */
export async function maybeStoreFrame(
  opts: MaybeStoreFrameOpts,
): Promise<string | null> {
  if (!env.STORE_FRAMES) return null;
  const { userId, sessionId, cycleId, frameBase64 } = opts;
  if (!frameBase64) return null;

  const path = `${userId}/${sessionId}/${cycleId}.webp`;
  try {
    const bytes = Buffer.from(frameBase64, "base64");
    const { error } = await supabaseAdmin()
      .storage.from(BUCKET)
      .upload(path, bytes, {
        contentType: "image/webp",
        upsert: true,
        cacheControl: "31536000, immutable",
      });
    if (error) {
      logger.warn(
        { err: error.message, path, sessionId },
        "frameStorage: upload failed (cycle still proceeds)",
      );
      return null;
    }
    return path;
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), path, sessionId },
      "frameStorage: upload threw (cycle still proceeds)",
    );
    return null;
  }
}

/**
 * Generate a short-lived signed URL for a frame so the dashboard can render
 * it. Used by the session replay (Phase 4 / G5). Falls back to null if the
 * bucket has nothing at that path or the supabase call errors.
 */
export async function signFrameUrl(
  path: string,
  ttlSeconds = 60 * 30,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
      logger.warn(
        { err: error?.message, path },
        "frameStorage: createSignedUrl failed",
      );
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), path },
      "frameStorage: createSignedUrl threw",
    );
    return null;
  }
}
