import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Port 3000 matters: NEAR Auth's shared testnet login only accepts localhost:3000.
export default defineConfig({
  root,
  base: process.env.FW_BASE ?? "./",
  plugins: [react()],
  server: { port: 3000, strictPort: true, host: "localhost" },
  preview: { port: 3000, strictPort: true, host: "localhost" },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
