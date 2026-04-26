/**
 * Quiet loading state that matches the marginalia aesthetic — no spinner,
 * just a single blinking pencil cursor and a faint label. Fills the viewport
 * so route guards can show it during the brief auth check on first paint.
 */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-ink">
      <div className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute mb-3">
        ione
      </div>
      <div className="font-sub text-paper text-sm pencil-cursor">
        loading
      </div>
    </div>
  );
}
