import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` controls the public-facing path the built assets reference.
//   Local dev:        "/"          (Vite dev server, no prefix)
//   Production behind nginx: "/internal/"   (reverse-proxy mounts SPA there)
// Read at build time from VITE_BASE_URL build-arg. Defaults to "/" so
// `npm run dev` and bare `npm run build` keep working without any setup.
const base = process.env.VITE_BASE_URL || "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      "/auth": {
        target:       "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir:    "dist",
    sourcemap: true,
  },
});
