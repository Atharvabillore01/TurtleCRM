import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/advisor/",
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
