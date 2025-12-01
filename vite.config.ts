import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";


const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // AxePool - Pool Management (port 5002)
      '/api/pools': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        secure: false,
      },
      '/api/devices/.*/pool': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        secure: false,
      },
      '/api/devices/.*/schedule': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        secure: false,
      },
      '/api/scheduler': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        secure: false,
      },
      
      // AxeShed - Profile Scheduling (port 5001)
      // Note: AxeShed also has /api/devices/<name>/schedule and /api/scheduler
      // These will be caught by AxePool proxy above since it's defined first
      // If you need AxeShed scheduler, use a different endpoint path
      
      // AxeBench - Main backend (port 5000)
      // This catches all other /api requests (devices, benchmark, profiles, sessions, etc.)
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
