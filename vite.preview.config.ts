/**
 * DEV-only standalone vite config to preview the tray renderer in a plain browser
 * (no Electron / Convex). `convex/react` is aliased to a canned-data mock and the
 * preview entry installs a window.agent mock. NOT used by electron-vite builds.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "src/renderer/app/__preview__"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@convex": resolve(__dirname, "convex"),
      "convex/react": resolve(__dirname, "src/renderer/app/__preview__/convex-mock.tsx"),
    },
  },
  server: { port: 5199, strictPort: true },
});
