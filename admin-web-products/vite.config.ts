import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@2m/shared": src("packages/shared/index.ts"),
      "@": src(""),
    },
  },
  plugins: [react()],
  // Backend API of the host project. Change the target to your own server.
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
