type Env = { ASSETS: { fetch: typeof fetch }; AMAP_JS_KEY?: string; AMAP_SECURITY_JS_CODE?: string };

const prefix = "/_AMapService";
const paths = new Set(["/v3/assistant/inputtips", "/v3/geocode/geo", "/v4/direction/bicycling", "/v3/log/init"]);
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Native updates verify the exact signed URL and reject redirects.
    if (/^\/web\/web-\d+\/index\.html$/.test(url.pathname)) {
      url.pathname = url.pathname.slice(0, -"index.html".length);
      return env.ASSETS.fetch(new Request(url, request));
    }
    if (!url.pathname.startsWith(`${prefix}/`)) return env.ASSETS.fetch(request);
    const path = url.pathname.slice(prefix.length);
    if (request.method !== "GET") return new Response(null, { status: 405 });
    if (!env.AMAP_JS_KEY || !env.AMAP_SECURITY_JS_CODE) return new Response(null, { status: 503, headers });
    if (path === "/config") return Response.json({ key: env.AMAP_JS_KEY }, { headers });
    if (!paths.has(path)) return new Response(null, { status: 404 });

    const { searchParams } = url;
    const callback = searchParams.get("callback");
    const keys = searchParams.getAll("key");
    if (url.search.length > 2048 || !keys.length || keys.some(key => key !== env.AMAP_JS_KEY) ||
      (callback !== null && !/^[$A-Z_a-z][\w$]{0,99}$/.test(callback))) return new Response(null, { status: 400 });
    searchParams.delete("jscode");
    searchParams.set("jscode", env.AMAP_SECURITY_JS_CODE);
    const target = new URL(path, "https://restapi.amap.com");
    target.search = searchParams.toString();
    try {
      const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { Referer: `${url.origin}/` } });
      if (!response.ok) return new Response(null, { status: 502, headers });
      return new Response(response.body, { headers: { ...headers, "Content-Type": callback ? "text/javascript; charset=utf-8" : "application/json; charset=utf-8" } });
    } catch {
      return new Response(null, { status: 502, headers });
    }
  },
};
