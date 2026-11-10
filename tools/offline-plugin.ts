import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(root, item.name)) : [join(root, item.name)]).sort();
}

// Content versions remain stable across repeated builds and change with UI or bundled artwork.
export function webVersion() {
  const hash = createHash("sha256");
  hash.update(process.env.VITE_UPDATE_BASE_URL || "");
  for (const path of [...files("src"), ...files("public").filter(path => !/^public\/(apk|firmware)\//.test(path) && !path.endsWith("dashboard-update.json")), ...files("tools"), "index.html", "vite.config.ts", "package.json", "package-lock.json"]) {
    hash.update(path); hash.update(readFileSync(path));
  }
  return hash.digest("hex").slice(0, 16);
}

export function offlinePlugin(version: string): Plugin {
  return {
    name: "dashboard-offline",
    apply: "build",
    closeBundle() {
      const root = "dist";
      writeFileSync(join(root, "web-version.json"), JSON.stringify({ version }));
      const entries = files(root).map(path => relative(root, path).replaceAll("\\", "/"))
        .filter(path => !/^(apk\/|firmware\/|sw\.js$|_headers$|_redirects$|dashboard-update\.json$)/.test(path))
        .map(path => ({ path, sha256: createHash("sha256").update(readFileSync(join(root, path))).digest("hex") }));
      const worker = `// Generated per build. Waiting updates activate only on next launch or explicit restart.
const VERSION = ${JSON.stringify(version)};
const SCOPE = new URL('./', self.location.href);
const PREFIX = 'bms-web-' + SCOPE.pathname + '-';
const CACHE = PREFIX + ${JSON.stringify(createHash("sha256").update(JSON.stringify(entries)).digest("hex"))};
const FILES = ${JSON.stringify(entries)};
const href = path => new URL(path, SCOPE).href;
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
    for (const file of FILES) {
      const response = await fetch(href(file.path), {cache:'no-store'});
      if (!response.ok || response.redirected) throw Error('Failed asset: ' + file.path);
      const bytes = await response.clone().arrayBuffer();
      const sum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if (sum !== file.sha256) throw Error('Asset checksum mismatch: ' + file.path);
      await cache.put(href(file.path), response);
    }
  } catch(error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Explicit activation can coexist with another tab still using the previous build.
  const pages = await self.clients.matchAll({type:'window', includeUncontrolled:true});
  if (!pages.length) for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const path = url.pathname.slice(SCOPE.pathname.length) || 'index.html';
  if (!FILES.some(file => file.path === path)) {
    if (path.startsWith('assets/')) event.respondWith((async () => {
      for (const name of await caches.keys()) if (name.startsWith(PREFIX)) {
        const cached = await (await caches.open(name)).match(href(path));
        if (cached) return cached;
      }
      return fetch(event.request);
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(href(path));
    return cached || new Response('Local asset unavailable', {status:503});
  })());
});
`;
      writeFileSync(join(root, "sw.js"), worker);
    },
  };
}
