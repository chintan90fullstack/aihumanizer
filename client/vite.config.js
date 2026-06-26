import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy API calls to the Node backend during development so the
// frontend can use relative /api paths without CORS headaches.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../deploy/dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        // Long articles on CPU can take 15–30+ minutes (paragraph-by-paragraph Ollama).
        timeout: 1800000,
        proxyTimeout: 1800000,
      },
    },
  },
});
