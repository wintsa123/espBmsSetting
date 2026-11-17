import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { offlinePlugin, webVersion } from "./tools/offline-plugin";

export default defineConfig(({ mode }) => {
  const preview = mode === "preview";
  const version = webVersion(loadEnv(mode, process.cwd(), "VITE_").VITE_TIANDITU_BROWSER_TK || "") + (preview ? "-preview" : "");
  const outDir = preview ? "dist-preview" : "dist";
  return {
  base: "./",
  build: { outDir },
  plugins: [react(), offlinePlugin(version, outDir)],
  define: { __WEB_VERSION__: JSON.stringify(version) },
  preview: {
    allowedHosts: ["wintsa123.fnos.net"],
    https: process.env.LAN_TLS_CERT && process.env.LAN_TLS_KEY ? {
      cert: readFileSync(process.env.LAN_TLS_CERT),
      key: readFileSync(process.env.LAN_TLS_KEY),
    } : undefined,
  },
  };
});
