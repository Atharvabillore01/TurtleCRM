import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev: "/" so http://localhost:3001 works.
// Production: VITE_BASE_URL=/advisor/ passed as Docker build-arg.
const base = process.env.VITE_BASE_URL || "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 3001,
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
