import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

const plugins = [react(), tailwindcss(), vitePluginManusRuntime()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(__dirname),
  root: path.resolve(__dirname, "client"),
  publicDir: path.resolve(__dirname, "client", "public"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // AxePool - Pool Management (port 5002)
      // Must come BEFORE the catch-all /api route
      '/api/pools': {
        target: process.env.AXEPOOL_URL || 'http://127.0.0.1:5002',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/api/scheduler': {
        target: process.env.AXEPOOL_URL || 'http://127.0.0.1:5002',
        changeOrigin: true,
        secure: false,
        ws: true,
      },

      // AxeBench - Main backend (port 5000)
      // This catches all other /api requests
      '/api': {
        target: process.env.AXEBENCH_URL || 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
