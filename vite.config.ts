import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { offlinePlugin, webVersion } from "./tools/offline-plugin";
const version = webVersion();

export default defineConfig({
  base: "./",
  plugins: [react(), offlinePlugin(version)],
  define: { __WEB_VERSION__: JSON.stringify(version) },
  preview: {
    allowedHosts: ["wintsa123.fnos.net"],
  },
});
