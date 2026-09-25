import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, the browser talks to Vite on 5173 and every /api call is proxied
// to the Express server on 8787. In production the Express server serves
// dist/ itself, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:" + (process.env.PORT || 8787),
        changeOrigin: true,
      },
    },
  },
});
