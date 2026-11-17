import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";
const workerTemplate = readFileSync(new URL("./update-worker.js", import.meta.url), "utf8");

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(root, item.name)) : [join(root, item.name)]).sort();
}

// Content versions remain stable across repeated builds and change with UI or bundled artwork.
export function webVersion(mapKey = "") {
  const hash = createHash("sha256");
  hash.update(process.env.VITE_UPDATE_BASE_URL || "");
  hash.update(mapKey);
  for (const path of [...files("src"), ...files("public").filter(path => !/^public\/(apk|firmware|web)\//.test(path) && !path.endsWith("dashboard-update.json")), ...files("tools"), "index.html", "vite.config.ts", "package.json", "package-lock.json"]) {
    hash.update(path); hash.update(readFileSync(path));
  }
  return hash.digest("hex").slice(0, 16);
}

export function offlinePlugin(version: string, root = "dist"): Plugin {
  return {
    name: "dashboard-offline",
    apply: "build",
    closeBundle() {
      writeFileSync(join(root, "web-version.json"), JSON.stringify({ version }));
      const entries = files(root).map(path => relative(root, path).replaceAll("\\", "/"))
        .filter(path => !/^(apk\/|firmware\/|web\/|web-update\.json$|sw\.js$|_headers$|_redirects$|dashboard-update\.json$)/.test(path))
        .map(path => ({ path, sha256: createHash("sha256").update(readFileSync(join(root, path))).digest("hex") }));
      const sequence = Number(process.env.WEB_UPDATE_SEQUENCE || Date.now());
      if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid WEB_UPDATE_SEQUENCE");
      writeFileSync(join(root, "web-update.json"), JSON.stringify({ version, sequence, files: entries }));
      const worker = workerTemplate
        .replace("__BMS_VERSION__", JSON.stringify(version))
        .replace("__BMS_SEQUENCE__", JSON.stringify(sequence))
        .replace("__BMS_FILES__", JSON.stringify(entries))
        .replace("__BMS_CACHE__", JSON.stringify(createHash("sha256").update(JSON.stringify(entries)).digest("hex")));
      writeFileSync(join(root, "sw.js"), worker);
    },
  };
}
