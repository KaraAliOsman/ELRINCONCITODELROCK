import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (forwarded, request) => {
            // Normalize only requests originating at this local Vite server.
            // The production Worker's strict origin check stays unchanged.
            if (request.headers.origin === `http://${request.headers.host}`)
              forwarded.setHeader("Origin", "http://127.0.0.1:8787");
          });
        },
      },
    },
  },
  build: { target: "es2022" },
});
