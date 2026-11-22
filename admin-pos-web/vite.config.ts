import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

// Default: dibangun ke dist/ dan disajikan FastAPI di /admin-pos (same origin dengan /api, cookie sesi tanpa CORS).
// Render Static Site terpisah di root domain: build dengan VITE_BASE=/ (lihat README).
export default defineConfig({
  base: process.env.VITE_BASE ?? "/admin-pos/",
  resolve: { alias: { "@": fileURLToPath(new URL("./src/", import.meta.url)) } },
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  // Dev: `npm run dev` lalu buka http://localhost:5174/admin-pos/ ; /api diteruskan ke uvicorn lokal.
  server: { port: 5174, proxy: { "/api": "http://localhost:8000" } },
});
