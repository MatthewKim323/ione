import { useEffect, useRef, useState } from "react";
import { HairlineRule } from "../design/HairlineRule";
import { PencilButton } from "../design/PencilButton";
import { Notebook, NotebookLayout } from "../design/Notebook";

/**
 * Stage failsafe for demo day. When the wifi or projector betrays us, opening
 * /tutor?mode=video skips the live agent loop entirely and plays a pre-rendered
 * recording of the rehearsed session. Exists only as a "the show must go on"
 * card — we never ship this URL to real users.
 *
 * The video file lives at /demo-backup.mp4 (public/demo-backup.mp4). If the
 * file is missing the component degrades gracefully so a half-deployed staging
 * environment doesn't block the real /tutor surface.
 *
 * Phase 5 / R6.
 */

const VIDEO_SRC = "/demo-backup.mp4";

export function BackupVideoStage() {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onLoaded = () => setLoaded(true);
    const onError = () => setMissing(true);
    v.addEventListener("loadeddata", onLoaded);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("loadeddata", onLoaded);
      v.removeEventListener("error", onError);
    };
  }, []);

  return (
    <Notebook className="min-h-[80vh]">
      <NotebookLayout
        main={
          <div className="flex flex-col gap-6">
            <header className="flex items-baseline justify-between">
              <div>
                <div className="section-label">stage failsafe · video mode</div>
                <h1
                  className="h-display text-3xl mt-1"
                  style={{ fontStyle: "italic" }}
                >
                  the rehearsal, on tape.
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <PencilButton
                  size="sm"
                  tone="ghost"
                  onClick={() => ref.current?.play().catch(() => {})}
                >
                  play
                </PencilButton>
                <PencilButton
                  size="sm"
                  tone="ghost"
                  onClick={() => {
                    const v = ref.current;
                    if (!v) return;
                    v.pause();
                    v.currentTime = 0;
                  }}
                >
                  reset
                </PencilButton>
              </div>
            </header>
            <HairlineRule ticks />

            <div className="relative aspect-[4/3] w-full border border-ink-line bg-ink overflow-hidden">
              {missing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-rust">
                    backup not found
                  </span>
                  <span
                    className="text-paper-dim text-sm leading-relaxed max-w-[36ch]"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontStyle: "italic",
                    }}
                  >
                    drop a recording at <code>landing/public/demo-backup.mp4</code>{" "}
                    and reload to enable the failsafe.
                  </span>
                </div>
              ) : (
                <video
                  ref={ref}
                  src={VIDEO_SRC}
                  controls
                  preload="auto"
                  className={[
                    "absolute inset-0 w-full h-full object-contain",
                    loaded ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                />
              )}
            </div>

            <footer className="mt-2 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              <span>mode · video</span>
              <span className="px-2 text-paper-faint">·</span>
              <span>no agents are running. this is a recording.</span>
            </footer>
          </div>
        }
        margin={
          <div className="flex flex-col gap-6 text-paper-dim text-[13px] leading-relaxed">
            <div className="section-label">why this exists</div>
            <p style={{ fontFamily: "var(--font-display)" }}>
              ione's live tutor depends on screen capture, anthropic, mathpix,
              and elevenlabs. in a conference hall any one of those can go dark
              for thirty seconds.
            </p>
            <p style={{ fontFamily: "var(--font-display)" }}>
              this page exists so the show can keep going. open it in a second
              tab before the talk; if anything cracks live, switch to it.
            </p>
            <div className="section-label mt-4">to leave video mode</div>
            <p style={{ fontFamily: "var(--font-display)" }}>
              drop the <code>?mode=video</code> query and refresh. the regular
              tutor surface returns immediately.
            </p>
          </div>
        }
      />
    </Notebook>
  );
}
