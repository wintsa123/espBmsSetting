export type Point = [number, number];
export type Fix = { point: Point; accuracy: number; time: number };
type Step = { end: number; instruction: string };
export type Route = { points: Point[]; cumulative: number[]; steps: Step[]; destination: Point };

type LngLat = Point | { getLng(): number; getLat(): number };
type Tip = { name: string; district?: string; address?: string; location?: LngLat | string };
export type Place = { name: string; details: string; point: Point };
type AMap = {
  AutoComplete: new (options: { datatype: string }) => { search(text: string, done: (status: string, result: { tips?: Tip[] }) => void): void };
  Geocoder: new () => { getLocation(name: string, done: (status: string, result: { geocodes?: { location: LngLat }[] }) => void): void };
  Riding: new (options: { policy: number }) => { search(from: Point, to: Point, done: (status: string, result: { routes?: { rides?: { path: LngLat[]; instruction?: string }[] }[] }) => void): void };
};

type MapWindow = Window & {
  AMapLoader?: { load(options: { key: string; version: string; plugins: string[] }): Promise<AMap> };
  _AMapSecurityConfig?: { serviceHost: string };
};

let loaded: Promise<AMap> | undefined;

function loadMaps() {
  if (loaded) return loaded;
  const host = window as MapWindow;
  const sdk = (async () => {
    const response = await fetch("/_AMapService/config", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("map-load");
    const { key } = await response.json();
    if (typeof key !== "string" || !/^[a-f0-9]{32}$/i.test(key)) throw new Error("map-load");
    if (!host.AMapLoader) {
      const script = document.createElement("script");
      script.src = "https://webapi.amap.com/loader.js";
      let timer = 0;
      try {
        await new Promise<void>((resolve, reject) => {
          const fail = () => reject(new Error("map-load"));
          timer = window.setTimeout(fail, 10000);
          script.onload = () => resolve();
          script.onerror = fail;
          document.head.append(script);
        });
      } finally { clearTimeout(timer); script.remove(); }
    }
    if (!host.AMapLoader) throw new Error("map-load");
    host._AMapSecurityConfig = { serviceHost: new URL("/_AMapService", window.location.href).href };
    return host.AMapLoader.load({ key, version: "2.0", plugins: ["AMap.Riding", "AMap.Geocoder", "AMap.AutoComplete"] });
  })();
  loaded = sdk;
  void sdk.catch(() => { if (loaded === sdk) loaded = undefined; });
  return sdk;
}

function asPoint(position: LngLat): Point {
  return Array.isArray(position) ? position : [position.getLng(), position.getLat()];
}

function validPoint([lon, lat]: Point) {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 85;
}

// Same WGS-84 → GCJ-02 conversion as Android NavGeo.gcj.
export function toGcj(point: Point): Point {
  const [lon, lat] = point;
  if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return point;
  const { PI, sin, cos, sqrt, abs } = Math;
  const x = lon - 105, y = lat - 35;
  const common = (20 * sin(6 * x * PI) + 20 * sin(2 * x * PI)) * 2 / 3;
  const dLat = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*sqrt(abs(x)) + common
    + (20*sin(y*PI) + 40*sin(y*PI/3) + 160*sin(y*PI/12) + 320*sin(y*PI/30)) * 2/3;
  const dLon = 300 + x + 2*y + .1*x*x + .1*x*y + .1*sqrt(abs(x)) + common
    + (20*sin(x*PI) + 40*sin(x*PI/3) + 150*sin(x*PI/12) + 300*sin(x*PI/30)) * 2/3;
  const rad = lat * PI / 180, eccentricity = .00669342162296594323;
  const magic = 1 - eccentricity * sin(rad) ** 2;
  return [lon + dLon * 180 * sqrt(magic) / (6378245 * cos(rad) * PI),
    lat + dLat * 180 * magic * sqrt(magic) / (6378245 * (1 - eccentricity) * PI)];
}

const radians = Math.PI / 180;
const metersPerDegree = 6371000 * radians;
const distance = (a: Point, b: Point) => Math.hypot((a[0] - b[0]) * Math.cos((a[1] + b[1]) / 2 * radians), a[1] - b[1]) * metersPerDegree;

export function destinationCoordinates(text: string): Point | undefined {
  const coordinates = /^([+-]?\d+(?:\.\d+)?)\s*[,，]\s*([+-]?\d+(?:\.\d+)?)$/.exec(text.trim());
  if (coordinates) return [Number(coordinates[1]), Number(coordinates[2])];
}

export async function searchPlaces(text: string, signal: AbortSignal): Promise<Place[]> {
  const sdk = await loadMaps();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    new sdk.AutoComplete({ datatype: "poi" }).search(text, (status, result) => {
      signal.removeEventListener("abort", cancel);
      if (signal.aborted) return;
      if (status === "no_data") { resolve([]); return; }
      if (status !== "complete") { reject(new Error("map-search")); return; }
      try {
        const places: Place[] = [];
        for (const { name, district, address, location } of result?.tips ?? []) {
          if (!name || !location) continue;
          const point = typeof location === "string" ? destinationCoordinates(location) : asPoint(location);
          if (!point || !validPoint(point)) continue;
          if (places.some(place => place.name === name && place.point[0] === point[0] && place.point[1] === point[1])) continue;
          const details = [district, address].filter(part => typeof part === "string" && part).join(" · ");
          places.push({ name, details, point });
          if (places.length >= 6) break;
        }
        resolve(places);
      } catch (error) { reject(error); }
    });
  });
}

export async function planRide(from: Point, target: string | Point, signal: AbortSignal): Promise<Route> {
  const sdk = await loadMaps();
  signal.throwIfAborted();
  const destination: Point = typeof target !== "string" ? target : destinationCoordinates(target) ?? await new Promise((resolve, reject) => {
    new sdk.Geocoder().getLocation(target, (status, result) => {
      const location = result?.geocodes?.[0]?.location;
      if (status === "complete" && location) resolve(asPoint(location));
      else reject(new Error("map-address"));
    });
  });
  signal.throwIfAborted();
  if (!validPoint(destination) || !validPoint(from)) throw new Error("map-address");
  return new Promise((resolve, reject) => {
    new sdk.Riding({ policy: 0 }).search(from, destination, (status, result) => {
      try {
        signal.throwIfAborted();
        const rides = result?.routes?.[0]?.rides;
        if (status !== "complete" || !rides?.length || rides.length > 5000) throw new Error("map-route");
        const points: Point[] = [], cumulative: number[] = [], steps: Step[] = [];
        let received = 0;
        for (const ride of rides) {
          if (!Array.isArray(ride.path) || !ride.path.length || (received += ride.path.length) > 60000) throw new Error("map-route");
          for (const location of ride.path) {
            const point = asPoint(location);
            if (!validPoint(point)) throw new Error("map-route");
            const previous = points.at(-1);
            const gap = previous ? distance(previous, point) : 0;
            if (previous && gap < 0.05) continue;
            points.push(point);
            cumulative.push((cumulative.at(-1) || 0) + gap);
          }
          steps.push({ end: cumulative.at(-1)!, instruction: String(ride.instruction || "").slice(0, 160) });
        }
        if (points.length < 2) throw new Error("map-route");
        resolve({ points, cumulative, steps, destination });
      } catch (error) { reject(error); }
    });
  });
}

export function rideProgress(route: Route, fix: Fix, previous?: number) {
  const { points, cumulative, steps } = route;
  const scale = Math.cos(fix.point[1] * radians);
  let best = Infinity, along = previous ?? 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (previous !== undefined && (cumulative[i + 1] < previous - 120 || cumulative[i] > previous + 1200)) continue;
    const a = points[i], b = points[i + 1];
    const x = (a[0] - fix.point[0]) * scale, y = a[1] - fix.point[1];
    const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy)));
    const error = Math.hypot(x + t * dx, y + t * dy) * metersPerDegree;
    if (error < best) { best = error; along = cumulative[i] + t * (cumulative[i + 1] - cumulative[i]); }
  }
  const reliable = Number.isFinite(fix.accuracy) && fix.accuracy <= 40;
  const offRoute = reliable && best > Math.max(35, fix.accuracy * 1.5);
  const matched = reliable && !offRoute ? Math.max(previous ?? 0, along) : previous;
  const current = matched ?? 0;
  const step = steps.find(item => item.end > current + 8) ?? steps.at(-1)!;
  const remaining = cumulative.at(-1)! - current;
  return { matched, reliable, offRoute, remaining, turn: Math.max(0, step.end - current), step: step.instruction,
    arrived: reliable && remaining < 35 && distance(fix.point, points.at(-1)!) < 45 };
}
