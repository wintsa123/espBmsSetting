// Generated per build. Verified downloads remain pending until navigation or explicit restart.
const VERSION = "9a6f564dde3a486f";
const SEQUENCE = 1794939141015;
const FILES = [{"path":"art/AE5_SOURCE.md","sha256":"9fe587dd2532946135869bcdf9f8b549cbe7286cbcad5a86375f2f5ac71bd762"},{"path":"art/ae5.webp","sha256":"b75d902670cdc5d46a63cc232f7b9b4928428bf9df7868bf9d31e5690fd2f0e7"},{"path":"art/controls/bmw-boot.webp","sha256":"4cc6e8a00c9de80383ac9524dff7f29b60780a52a616e6f116f92a596b077b8a"},{"path":"art/controls/bmw-dashboard.webp","sha256":"758ae8586ac99eb08a9adb074064f39a83a10a9f47915c839564463573492399"},{"path":"art/controls/charge-boot.webp","sha256":"af78c7eea6ff616f2b2affe279fb58194b70aa6eaefa01e2948f12340d7c4d3f"},{"path":"art/controls/controller-dashboard.webp","sha256":"304a02741c135ec1a9c55e850b094e18bcd864df43470e52a28f4603bc1c3611"},{"path":"art/controls/honda-boot.webp","sha256":"263a0d8cc948415215b0b9bf102ddac666f700904d0ae91ad7726bcbfa1d13df"},{"path":"art/controls/honda-dashboard.webp","sha256":"fc83866f2eeebc207ce5cfe2f93f973c544a782bae8e8252716b1fe2cf64e158"},{"path":"art/presets/PRESETS_SOURCE.md","sha256":"9bd9f330591cfa7896ad255d99e790a8365c60117172284c8ead277801d43bfe"},{"path":"art/presets/city.svg","sha256":"4b91ff13c8fb0c4b7d02cfc1619ce761ff31bd67c01d8842f6a9bafb902a7f0b"},{"path":"art/presets/commuter.svg","sha256":"00a45f549c572de57fc9827bdd9cfa6037a0c3cacf02f4b4985853488a1a7c8b"},{"path":"art/presets/retro.svg","sha256":"6e9240cc716c0e5a72be684ed4ef1026c1ed26f3dee73d287a0dc49fa7f0d925"},{"path":"art/presets/sport.svg","sha256":"1f207f3756e766f62c0ced41843049e49d9b0a666e119f611ea66658afb0d92f"},{"path":"assets/index-CRFmISrO.js","sha256":"bc9f10ba325d13b7755f70150328c9d82bccac92c8044ab81f8eabbc12b7853f"},{"path":"assets/index-DiKM1mqA.css","sha256":"25bccb9cb3b8d912effc8a0de5d32d51862db576c266a8cf2e3fd0ce66378253"},{"path":"index.html","sha256":"83fb646bca5a8416753cb295cb6185fa6b89f9619bc24ea2f96dde71ef1e5147"},{"path":"web-version.json","sha256":"e90a4bc957d8876814e1e4c3dfde755369ed77810fcd30d36191cd89d3ee7f24"}];
const SCOPE = new URL('./', self.location.href);
const PREFIX = 'bms-web-' + SCOPE.pathname + '-';
const META = PREFIX + 'state';
const CACHE = PREFIX + SEQUENCE + '-' + "fce3dcd5023bb4e5c592cbc37dc8fb0fe85975e8d46d20914dd5ad1a385944d1";
const href = path => new URL(path, SCOPE).href;
const INITIAL = {version:VERSION, sequence:SEQUENCE, cache:CACHE, files:FILES};
const STATE_URL = href('__update_state__');
let busy = false;
const mime = path => path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : path.endsWith('.jpg') || path.endsWith('.jpeg') ? 'image/jpeg' : 'application/json';
async function readState() {
  const response = await (await caches.open(META)).match(STATE_URL);
  return response ? response.json() : {active:INITIAL, status:'current'};
}
async function writeState(state) {
  await (await caches.open(META)).put(STATE_URL, new Response(JSON.stringify(state), {headers:{'Content-Type':'application/json'}}));
}
function visible(state, currentVersion) {
  const next = state.pending || (state.active.version !== currentVersion ? state.active : null);
  return {currentVersion, pendingVersion:next?.version, source:state.source, status:busy ? 'downloading' : state.status === 'error' ? 'error' : next ? 'ready' : 'current', error:state.error};
}
function validate(manifest) {
  if (!manifest || typeof manifest.version !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(manifest.version) || !Number.isSafeInteger(manifest.sequence) || manifest.sequence < 1 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 512) throw Error('无效的网页更新清单 / Invalid Web manifest');
  const paths = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || file.path.length > 240 || !/^[A-Za-z0-9_./-]+$/.test(file.path) || file.path.split('/').some(part => !part || part.startsWith('.')) || /^(apk|firmware|web)\//.test(file.path) || ['sw.js','dashboard-update.json','web-update.json','_headers','_redirects'].includes(file.path) || paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('无效的网页资源 / Invalid Web asset');
    paths.add(file.path);
  }
  if (!paths.has('index.html')) throw Error('缺少首页资源 / Missing index');
}
async function download(record, base, local = false) {
  const cache = await caches.open(record.cache);
  let total = 0;
  try {
    for (const file of record.files) {
      const url = new URL(local && file.path === 'index.html' ? '' : file.path, base);
      const response = await fetch(url, {cache:'no-store', signal:AbortSignal.timeout(20000)});
      if (!response.ok || response.redirected) throw Error('资源服务 HTTP ' + response.status + ': ' + file.path);
      if (Number(response.headers.get('content-length')) > 8*1024*1024) throw Error('资源超限');
      const bytes = await response.arrayBuffer(); total += bytes.byteLength;
      if (!bytes.byteLength || bytes.byteLength > 8*1024*1024 || total > 32*1024*1024) throw Error('资源超限');
      const sum = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if (sum !== file.sha256) throw Error('资源哈希不符 / Asset checksum mismatch: ' + file.path);
      // GitHub Raw serves scripts as text/plain with a sandbox CSP; cache bytes with their actual local MIME type.
      await cache.put(href(file.path), new Response(bytes, {headers:{'Content-Type':mime(file.path)}}));
    }
  } catch (error) { await caches.delete(record.cache); throw error; }
}
async function check(source) {
  if (busy) return;
  busy = true;
  let state = await readState();
  state.source = source; state.status = 'checking'; delete state.error;
  await writeState(state);
  try {
    const base = source === 'github' ? new URL('https://raw.githubusercontent.com/wintsa123/espBmsSetting/updates/') : SCOPE;
    const url = new URL('web-update.json',base); url.searchParams.set('_check',Date.now());
    const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('清单服务 HTTP ' + response.status);
    const text = await response.text(); if (text.length > 256*1024) throw Error('清单超限');
    const manifest = JSON.parse(text); validate(manifest);
    const newest = state.pending || state.active;
    if (manifest.version !== newest.version && manifest.sequence > newest.sequence) {
      state.status = 'downloading'; await writeState(state);
      const record = {...manifest,cache:PREFIX + 'stage-' + crypto.randomUUID()};
      await download(record,base,source === 'cf');
      // Publish the pending pointer only after every resource has passed its hash check.
      state = await readState(); state.pending = record;
    }
    state.status = state.pending ? 'ready' : 'current'; state.source = source; delete state.error;
  } catch (error) { state = await readState(); state.status = 'error'; state.error = String(error); state.source = source; throw error; }
  finally { await writeState(state); busy = false; }
}
async function apply() {
  const state = await readState();
  if (state.pending) { state.active = state.pending; delete state.pending; }
  if (INITIAL.sequence > state.active.sequence) state.active = INITIAL;
  state.status = 'current'; delete state.error; await writeState(state);
}
self.addEventListener('install',event=>event.waitUntil(download(INITIAL,SCOPE,true)));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const state = await readState();
  if (INITIAL.sequence > state.active.sequence) {state.active = INITIAL; if (state.pending?.sequence <= INITIAL.sequence) delete state.pending; state.status = state.pending ? 'ready' : 'current'; delete state.error;}
  await writeState(state);
  const pages = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if (!pages.length) for (const name of await caches.keys()) if (name.startsWith(PREFIX) && ![META,state.active.cache,state.pending?.cache].includes(name)) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  const data = event.data || {};
  event.waitUntil((async()=>{
    try {
      if (data.type === 'CHECK_UPDATE') {if (!['cf','github'].includes(data.source)) throw Error('无效的更新链路'); await check(data.source);}
      if (data.type === 'ACTIVATE_UPDATE') {await apply(); await self.skipWaiting();}
      event.ports[0]?.postMessage(visible(await readState(),data.currentVersion || VERSION));
    } catch (error) {event.ports[0]?.postMessage({...visible(await readState(),data.currentVersion || VERSION),status:'error',error:String(error)});}
  })());
});
self.addEventListener('fetch',event=>{
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const path = url.pathname.slice(SCOPE.pathname.length) || 'index.html';
  if (/^(api|apk|firmware|web)\//.test(path) || ['sw.js','web-update.json','manifest.json'].includes(path)) return;
  event.respondWith((async()=>{
    if (event.request.mode === 'navigate') await apply();
    const state = await readState();
    const cached = await (await caches.open(state.active.cache)).match(href(path));
    if (cached) return cached;
    // An older tab may still import chunks from the build it originally opened.
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== META) {
      const old = await (await caches.open(name)).match(href(path)); if (old) return old;
    }
    return fetch(event.request);
  })());
});
