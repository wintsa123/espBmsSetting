// Generated per build. Verified downloads remain pending until navigation or explicit restart.
const VERSION = __BMS_VERSION__;
const SEQUENCE = __BMS_SEQUENCE__;
const FILES = __BMS_FILES__;
const SCOPE = new URL('./', self.location.href);
const PREFIX = 'bms-web-' + SCOPE.pathname + '-';
const META = PREFIX + 'state';
const CACHE = PREFIX + SEQUENCE + '-' + __BMS_CACHE__;
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
