/**
 * When the URL has ?nofx, skip entry animations. Used so headless screenshot
 * tooling and crawlers see the final, populated state without waiting for
 * Motion's animation loop to settle.
 */
export const SKIP_FX =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("nofx");
