import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dibangun ke dist/ dan disajikan FastAPI di /kiosk (same origin dengan /api, tanpa CORS).
export default defineConfig({
  // Default /kiosk/ (disajikan FastAPI). Render Static Site di root domain: build dengan VITE_BASE=/
  base: process.env.VITE_BASE ?? "/kiosk/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  // Dev: `npm run dev` lalu buka http://localhost:5172/kiosk/ ; /api diteruskan ke uvicorn lokal.
  server: { port: 5172, proxy: { "/api": "http://localhost:8000" } },
});
