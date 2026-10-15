import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset reference relative, so the same build works from a GitHub Pages
// project subpath or a root domain.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5180 },
  build: { outDir: "dist", chunkSizeWarningLimit: 4000 },
});
