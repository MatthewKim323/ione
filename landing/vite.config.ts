import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Lenis (smooth scroll) — explicit pre-bundle avoids 504 "Outdated Optimize Dep"
  // after pulls / lockfile updates when the dev server cache is stale.
  optimizeDeps: {
    include: ["lenis"],
  },
  server: {
    port: 5234,
    strictPort: true,
    host: true,
  },
});
