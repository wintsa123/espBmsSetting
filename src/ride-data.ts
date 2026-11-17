import { useEffect, useRef, useState } from "react";
import { validGpsPoint, type TrackPoint } from "./GpsTrackMap";
import type { RideSession } from "./RideHistory";

type RidePoint = TrackPoint & { elapsed_s?: number };
export type TrackState = { points: (RidePoint | null)[]; cursor: number | null; samples: number };
export type RideTrack = TrackState & { session: RideSession; loaded: boolean; resumeCursor?: number | null };
export type RideData = ReturnType<typeof useRideData>;
const empty = (): TrackState => ({ points: [], cursor: null, samples: 0 });

export async function readTrackPage(request: (path: string) => Promise<unknown>, session: number | undefined, cursor: number | null, http: boolean): Promise<TrackState> {
  if (session === undefined) {
    if (!http) throw new Error("no-session");
    const result = await request("/api/gps/track") as { points?: unknown[] };
    if (!Array.isArray(result?.points)) throw new Error("invalid-track");
    return { points: result.points.map(p => validGpsPoint(p) ? p : null), cursor: null, samples: result.points.length };
  }
  const query = new URLSearchParams({ session: String(session), from: "0", to: "9223372036854775807", limit: http ? "500" : "8" });
  if (cursor !== null) query.set("cursor", String(cursor));
  const result = await request(`/api/history/samples?${query}`) as { samples?: unknown[]; next_cursor?: number | null };
  if (!Array.isArray(result?.samples) || (result.next_cursor != null && (!Number.isSafeInteger(result.next_cursor) || result.next_cursor < 0 || (cursor !== null && result.next_cursor <= cursor)))) throw new Error("invalid-track");
  const points = result.samples.map(value => {
    const p = value as { flags?: number; elapsed_s?: number };
    return Number.isInteger(p?.flags) && (p.flags! & 1) && validGpsPoint(value)
      ? { lat_e7: value.lat_e7, lon_e7: value.lon_e7, elapsed_s: Number.isSafeInteger(p.elapsed_s) && p.elapsed_s! >= 0 ? p.elapsed_s : undefined } : null;
  });
  return { points, cursor: result.samples.length ? result.next_cursor ?? null : null, samples: result.samples.length };
}

export function useRideData(sessions: RideSession[], connected: boolean, http: boolean, source: string, request: (path: string) => Promise<unknown>) {
  const [tracks, setTracks] = useState<RideTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(request); requestRef.current = request;
  const owner = useRef("");
  const signature = JSON.stringify(sessions);
  const current = useRef<RideTrack[]>([]), generation = useRef(0), running = useRef<number | null>(null);
  const read = async () => {
    const token = generation.current;
    if (!connected || running.current === token) return;
    running.current = token; setLoading(true); setError("");
    try {
      // shortcut: BLE 每批最多读取每段 256 个样本，长轨迹在记录页继续读取，避免长期占用连接。
      for (let index = 0; index < current.current.length; index++) {
        let track = current.current[index];
        if (track.loaded && track.cursor === null) continue;
        for (let page = 0; page < 32; page++) {
          if (token !== generation.current) return;
          const result = await readTrackPage(path => requestRef.current(path), track.session.id, track.cursor, http);
          if (token !== generation.current) return;
          track = { ...track, points: [...track.points, ...result.points], samples: track.samples + result.samples, cursor: result.cursor, resumeCursor: result.cursor ?? track.resumeCursor ?? track.cursor, loaded: true };
          current.current = current.current.map((item, i) => i === index ? track : item);
          setTracks(current.current);
          if (track.cursor === null) break;
        }
      }
    } catch (reason) { if (token === generation.current) setError(reason instanceof Error ? reason.message : "read-failed"); }
    finally { if (token === generation.current) { running.current = null; setLoading(false); } }
  };
  useEffect(() => {
    generation.current++;
    const identity = `${connected}:${http}:${source}`;
    const sameDevice = owner.current === identity;
    owner.current = identity;
    current.current = connected ? sessions.map(session => {
      const previous = sameDevice && current.current.find(track => track.session.id === session.id);
      if (!previous || previous.samples > session.samples) return { ...empty(), session, loaded: false };
      const appended = session.samples > previous.session.samples && previous.cursor === null;
      return { ...previous, session, cursor: appended ? previous.resumeCursor ?? null : previous.cursor,
        loaded: appended && previous.resumeCursor == null ? false : previous.loaded };
    }) : [];
    setTracks(current.current); setError(""); setLoading(false);
    if (connected && sessions.length) void read();
    return () => { generation.current++; };
  }, [signature, connected, http, source]);
  return { tracks, loading, error, more: tracks.some(track => !track.loaded || track.cursor !== null), read };
}

export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const dated = (session: RideSession) => session.calibrated && Number.isFinite(session.start_s) && session.start_s >= 946684800;
export const duration = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
export const distance = (km: number | null) => km === null ? "—" : km.toFixed(1);

/** Only adjacent valid GPS samples contribute; uncalibrated sessions never enter a calendar bucket. */
export function rideSummary(tracks: RideTrack[], from = -Infinity, to = Infinity) {
  let km = 0, seconds = 0, maxSpeed = 0, pairs = 0;
  for (const track of tracks) {
    const session = track.session;
    if ((Number.isFinite(from) || Number.isFinite(to)) && !dated(session)) continue;
    const start = session.start_s;
    seconds += Math.max(0, Math.min(start + session.elapsed_s, to) - Math.max(start, from));
    for (let index = 1; index < track.points.length; index++) {
      const a = track.points[index - 1], b = track.points[index];
      if (!a || !b || a.elapsed_s === undefined || b.elapsed_s === undefined || b.elapsed_s <= a.elapsed_s) continue;
      const at = start + b.elapsed_s;
      if (at < from || at >= to) continue;
      const rad = Math.PI / 180 / 1e7;
      const h = Math.sin((b.lat_e7 - a.lat_e7) * rad / 2) ** 2 + Math.cos(a.lat_e7 * rad) * Math.cos(b.lat_e7 * rad) * Math.sin((b.lon_e7 - a.lon_e7) * rad / 2) ** 2;
      const part = 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
      const elapsed = b.elapsed_s - a.elapsed_s;
      km += part; pairs++; maxSpeed = Math.max(maxSpeed, part / elapsed * 3600);
    }
  }
  return { km: pairs ? km : null, seconds, avg: pairs && seconds > 0 ? km / seconds * 3600 : null, max: pairs ? maxSpeed : null };
}

export function ridesInRange(tracks: RideTrack[], from: number, to: number) {
  return tracks.filter(({ session }) => dated(session) && session.start_s < to && session.start_s + session.elapsed_s >= from);
}
