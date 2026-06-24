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
        // Ollama on CPU can take several minutes; keep the proxy connection
        // open long enough so the response isn't dropped (which would surface
        // as an empty body / JSON parse error on the client).
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
});
