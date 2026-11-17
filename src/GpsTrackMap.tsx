import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./GpsTrackMap.css";

export type TrackPoint = { lat_e7: number; lon_e7: number; timestamp_s?: number };
export function validGpsPoint(value: unknown): value is TrackPoint {
  if (!value || typeof value !== "object") return false;
  const p = value as TrackPoint;
  return Number.isInteger(p.lat_e7) && Number.isInteger(p.lon_e7) && Math.abs(p.lat_e7) <= 900000000 && Math.abs(p.lon_e7) <= 1800000000;
}

export default function GpsTrackMap({ points, language }: { points: (TrackPoint | null)[]; language: "zh" | "en" }) {
  const id = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const zh = language === "zh", key = import.meta.env.VITE_TIANDITU_BROWSER_TK;
  const hasPoints = points.some(validGpsPoint);
  // The SDK installs document/window listeners and has no public destroy method.
  // A frame gives each map a disposable document and keeps its CSS out of the dashboard.
  const documentHtml = useMemo(() => {
    const data = JSON.stringify({ id, zh, points: points.map(p => validGpsPoint(p) ? [p.lon_e7 / 1e7, p.lat_e7 / 1e7] : null) }).replaceAll("<", "\\u003c");
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#map{height:100%;width:100%;margin:0;overflow:hidden}body{background:#eeeaf3} .tdt-label{border-radius:8px;font:12px sans-serif;padding:3px 7px}</style></head><body><div id="map"></div><script>
const data=${data};
const report=status=>parent.postMessage({kind:'bms-gps-map',id:data.id,status},'*');
let tiles=0, map;
window.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement && /tianditu/.test(event.target.src)){tiles++;report('ready');}},true);
window.addEventListener('resize',()=>map?.checkResize());
const sdk=document.createElement('script');
sdk.src='https://api.tianditu.gov.cn/api?v=4.0&tk=${encodeURIComponent(key || "")}';
sdk.onerror=()=>report('error');
sdk.onload=()=>{
  const deadline=Date.now()+15000;
  const initialize=()=>{
  if(!window.T || !['Map','LngLat','Polyline','Marker'].every(name=>typeof T[name]==='function')){if(Date.now()<deadline)setTimeout(initialize,50);else report('error');return;}
  try {
    map=new T.Map('map',{minZoom:3,maxZoom:18});
    const segments=[[]];
    for(const p of data.points){if(!p){if(segments.at(-1).length)segments.push([]);}else segments.at(-1).push(new T.LngLat(p[0],p[1]));}
    const all=segments.flat();map.centerAndZoom(all.at(-1),15);if(all.length>1)map.setViewport(all);
    for(const segment of segments)if(segment.length>1)map.addOverLay(new T.Polyline(segment,{color:'#7561d1',weight:5,opacity:.9}));
    map.addOverLay(new T.Marker(all[0],{title:data.zh?'起点':'Start'}));
    if(all.length>1)map.addOverLay(new T.Marker(all.at(-1),{title:data.zh?'终点':'End'}));
    report('ready');
    setTimeout(()=>{if(!tiles)report('tiles-error');},12000);
  }catch(error){report('error');}
  };
  initialize();
};
document.head.appendChild(sdk);
</script></body></html>`;
  }, [id, points, zh, key]);
  useEffect(() => {
    setStatus("loading");
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.kind !== "bms-gps-map" || event.data.id !== id) return;
      if (["ready", "error", "tiles-error"].includes(event.data.status)) setStatus(event.data.status);
    };
    window.addEventListener("message", receive);
    const timer = window.setTimeout(() => setStatus(current => current === "loading" ? "error" : current), 18000);
    return () => { window.removeEventListener("message", receive); window.clearTimeout(timer); };
  }, [documentHtml, attempt, id]);
  return <div className="gps-map-wrap" data-no-swipe data-no-home-press>
    {hasPoints && key && <iframe key={attempt} className="gps-map" ref={frame} title={zh ? "ESP32 GPS 轨迹地图" : "ESP32 GPS track map"} srcDoc={documentHtml} />}
    {!hasPoints ? <p className="gps-map-message">{zh ? "暂无有效 GPS 轨迹，等待设备记录定位" : "No valid GPS track; waiting for device recordings"}</p> : !key ? <p className="gps-map-message" role="alert">{zh ? "未配置天地图浏览器密钥" : "Browser map key is missing"}</p> : status === "loading" ? <p className="gps-map-message" role="status">{zh ? "正在加载天地图…" : "Loading map…"}</p> : (status === "error" || status === "tiles-error") && <div className={status === "error" ? "gps-map-message" : "gps-map-warning"} role="alert"><p>{zh ? "底图加载失败，请检查互联网连接及地图域名授权" : "Map unavailable; check internet access and allowed domains"}</p><button className="btn tonal" onClick={() => setAttempt(value => value + 1)}>{zh ? "重试地图" : "Retry map"}</button></div>}
  </div>;
}
