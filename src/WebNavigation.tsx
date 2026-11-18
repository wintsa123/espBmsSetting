import { useEffect, useId, useRef, useState } from "react";
import { startPanelStream, streamError, type DeviceRequest } from "./panel-stream";
import { destinationCoordinates, planRide, rideProgress, searchPlaces, toGcj, type Fix, type Place, type Route } from "./web-navigation";

type Progress = ReturnType<typeof rideProgress>;
type Guidance = { route: Route; fix: Fix; progress: Progress };

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function drawGuidance(context: CanvasRenderingContext2D, guidance: Guidance | undefined, status: string, zh: boolean) {
  const { width, height } = context.canvas;
  context.fillStyle = "#101820";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#dce8ed";
  context.font = `600 ${Math.round(width / 21)}px sans-serif`;
  if (!guidance) {
    context.fillText(status, 16, height / 2, width - 32);
    return;
  }
  const { route, fix, progress } = guidance;
  context.fillStyle = "#8ce9d7";
  context.fillText(status || progress.step || (zh ? "沿路线骑行" : "Follow the route"), 16, 37, width - 32);
  context.font = `700 ${Math.round(width / 13)}px sans-serif`;
  if (!status) context.fillText(formatDistance(progress.turn), 16, 76);
  context.font = `500 ${Math.round(width / 28)}px sans-serif`;
  context.fillStyle = "#dce8ed";
  context.textAlign = "right";
  context.fillText(`${zh ? "剩余" : "Left"} ${formatDistance(progress.remaining)}`, width - 16, 76);
  context.textAlign = "left";
  if (progress.offRoute || !progress.reliable || status) return;

  const start = (progress.matched ?? 0) - 70;
  const points = route.points.filter((_, index) => route.cumulative[index] >= start && route.cumulative[index] <= start + 700);
  if (points.length < 2) return;
  const scale = Math.cos(fix.point[1] * Math.PI / 180);
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const [lon, lat] of points) {
    const x = (lon - fix.point[0]) * scale, y = lat - fix.point[1];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const zoom = Math.min((width - 58) / Math.max(maxX - minX, .0001), (height - 130) / Math.max(maxY - minY, .0001));
  const x = width / 2 - (minX + maxX) * zoom / 2;
  const y = (height + 94) / 2 + (minY + maxY) * zoom / 2;
  context.beginPath();
  points.forEach(([lon, lat], index) => context[index ? "lineTo" : "moveTo"](x + (lon - fix.point[0]) * scale * zoom, y - (lat - fix.point[1]) * zoom));
  context.strokeStyle = "#46d7c2";
  context.lineWidth = 6;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.beginPath();
  context.arc(x, y, 6, 0, 2 * Math.PI);
  context.fillStyle = "#fff";
  context.fill();
}

export default function WebNavigation({ zh, origin, request }: { zh: boolean; origin: string; request: DeviceRequest }) {
  const [destination, setDestination] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<Place>();
  const [places, setPlaces] = useState<Place[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activePlace, setActivePlace] = useState(-1);
  const [lookup, setLookup] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const placesId = useId();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const ready = !!destination.trim();
  const [guidance, setGuidance] = useState<Guidance>();
  const [panel, setPanel] = useState<"idle" | "starting" | "active">("idle");
  const [panelMessage, setPanelMessage] = useState("");
  const gpsSession = useRef<AbortController | undefined>(undefined);
  const panelSession = useRef<AbortController | undefined>(undefined);
  const preview = useRef<HTMLCanvasElement>(null);
  const display = useRef({ guidance, status });
  display.current = { guidance, status };

  useEffect(() => () => { gpsSession.current?.abort(); panelSession.current?.abort(); }, []);
  useEffect(() => {
    const text = destination.trim();
    if (!suggestionsOpen || running || selectedPlace || text.length < 2 || destinationCoordinates(text)) return;
    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      setLookup("loading");
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
      try {
        const results = await searchPlaces(text, signal);
        if (controller.signal.aborted) return;
        setPlaces(results);
        setLookup(results.length ? "idle" : "empty");
      } catch {
        if (!controller.signal.aborted) setLookup("error");
      }
    }, 280);
    return () => { clearTimeout(debounce); controller.abort(); };
  }, [destination, running, selectedPlace, suggestionsOpen]);

  useEffect(() => {
    const context = preview.current?.getContext("2d");
    if (context) drawGuidance(context, guidance, status, zh);
  }, [guidance, status, zh]);

  function selectPlace(place: Place) {
    setSelectedPlace(place);
    setDestination(place.name);
    setSuggestionsOpen(false);
  }

  function stopPanel(message = "") {
    panelSession.current?.abort();
    panelSession.current = undefined;
    setPanel("idle");
    setPanelMessage(message);
  }

  function stop() {
    gpsSession.current?.abort();
    gpsSession.current = undefined;
    stopPanel();
    setGuidance(undefined);
    setStatus("");
    setRunning(false);
  }

  function start() {
    if (gpsSession.current || !ready || !window.isSecureContext || !navigator.geolocation) return;
    const controller = new AbortController();
    gpsSession.current = controller;
    setSuggestionsOpen(false);
    setRunning(true);
    const locating = zh ? "正在获取当前位置…" : "Getting your location…";
    const weak = zh ? "定位信号较弱，等待准确位置" : "Waiting for an accurate location";
    const offRoute = zh ? "已偏离路线" : "Off route";
    const arrived = zh ? "已到达目的地" : "Destination reached";
    setStatus(locating);
    let route: Route | undefined, matched: number | undefined, latest: Fix | undefined;
    let offSince = 0, nextPlan = 0, stale = 0;
    let planning = false;
    const update = (fix: Fix) => {
      if (!route) return;
      const progress = rideProgress(route, fix, matched);
      matched = progress.matched;
      const message = progress.arrived ? arrived : !progress.reliable ? weak : progress.offRoute ? offRoute : "";
      setGuidance({ route, fix, progress });
      setStatus(message);
      if (progress.arrived) {
        navigator.geolocation.clearWatch(watch);
        clearTimeout(stale);
      }
      offSince = progress.offRoute ? offSince || fix.time : 0;
      if (offSince && fix.time - offSince >= 6000 && fix.time >= nextPlan && !planning) void calculate(fix, route);
    };
    const calculate = async (fix: Fix, old?: Route) => {
      planning = true;
      nextPlan = fix.time + 30000;
      setStatus(old ? (zh ? "正在重新规划…" : "Recalculating…") : (zh ? "正在规划骑行路线…" : "Planning a cycling route…"));
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
      let rejectOnAbort: () => void = () => {};
      try {
        const timeout = new Promise<never>((_, reject) => {
          rejectOnAbort = () => reject(signal.reason);
          signal.addEventListener("abort", rejectOnAbort, { once: true });
        });
        route = await Promise.race([planRide(fix.point, old?.destination ?? selectedPlace?.point ?? destination.trim(), signal), timeout]);
        matched = undefined;
        offSince = 0;
        if (latest && Date.now() - latest.time < 15000) update(latest);
        else setStatus(weak);
      } catch {
        if (controller.signal.aborted) return;
        if (!old) stop();
        setStatus(zh ? "骑行规划失败，请确认目的地和网络后重试。" : "Route planning failed. Check the destination and your network, then try again.");
      } finally {
        planning = false;
        signal.removeEventListener("abort", rejectOnAbort);
      }
    };
    const watch = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
      if (controller.signal.aborted) return;
      const fix = latest = { point: toGcj([coords.longitude, coords.latitude]), accuracy: coords.accuracy, time: timestamp };
      clearTimeout(stale);
      stale = window.setTimeout(() => { setStatus(weak); offSince = 0; }, 15000);
      if (planning) return;
      if (route) update(fix);
      else if (fix.accuracy <= 40) void calculate(fix);
      else setStatus(weak);
    }, error => {
      if (controller.signal.aborted) return;
      if (error.code === 1) {
        stop();
        setStatus(zh ? "请允许网页获取位置后重试。" : "Allow location access and retry.");
      } else setStatus(zh ? "暂时无法定位，正在重试…" : "Location unavailable. Retrying…");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    controller.signal.addEventListener("abort", () => { navigator.geolocation.clearWatch(watch); clearTimeout(stale); }, { once: true });
  }

  function sendToPanel() {
    if (panelSession.current) return;
    const controller = new AbortController();
    panelSession.current = controller;
    setPanel("starting");
    setPanelMessage("");
    startPanelStream({ origin, request, signal: controller.signal, interval: 900, landscape: true,
      draw: context => { drawGuidance(context, display.current.guidance, display.current.status, zh); return true; },
      onActive: () => setPanel("active"),
      onEnd: error => stopPanel(error ? streamError(error, zh) : (zh ? "面板已结束显示。" : "The panel ended the session.")),
    });
  }

  return <div className="stack web-feature">
    {!running && <p className="card-sub">{zh ? "高德规划需要互联网。规划完成后，可连接面板热点显示导航。" : "Route planning needs internet access. After planning, join the panel hotspot to show navigation on the display."}</p>}
    <form className="stack" onSubmit={event => { event.preventDefault(); start(); }}>
      <div className="nav-destination" data-dropdown-open={suggestionsOpen && !!places.length}>
        <label>{zh ? "骑行目的地" : "Cycling destination"}
          <input role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen && !!places.length}
            aria-controls={suggestionsOpen && places.length ? placesId : undefined}
            aria-activedescendant={suggestionsOpen && places[activePlace] ? `${placesId}-${activePlace}` : undefined}
            value={destination} autoComplete="off" required disabled={running} maxLength={120}
            placeholder={zh ? "输入地点或地址" : "Enter a place or address"}
            onChange={event => {
              setDestination(event.target.value); setSelectedPlace(undefined); setPlaces([]);
              setActivePlace(-1); setLookup("idle"); setSuggestionsOpen(true);
            }} onFocus={() => { if (!selectedPlace) setSuggestionsOpen(true); }}
            onBlur={() => { setSuggestionsOpen(false); setActivePlace(-1); }}
            onKeyDown={event => {
              if (!suggestionsOpen || !places.length || event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = event.key === "ArrowDown" ? (activePlace + 1) % places.length : (activePlace <= 0 ? places.length - 1 : activePlace - 1);
                setActivePlace(next);
                document.getElementById(`${placesId}-${next}`)?.scrollIntoView({ block: "nearest" });
              } else if (event.key === "Enter" && places[activePlace]) {
                event.preventDefault(); selectPlace(places[activePlace]);
              } else if (event.key === "Escape") {
                event.preventDefault(); setSuggestionsOpen(false); setActivePlace(-1);
              }
            }} />
        </label>
        {suggestionsOpen && !!places.length && <ul className="nav-places" id={placesId} role="listbox" aria-label={zh ? "目的地候选" : "Destination suggestions"}>
          {places.map((place, index) => <li id={`${placesId}-${index}`} key={index} role="option" aria-selected={index === activePlace}
            onMouseDown={event => event.preventDefault()} onClick={() => selectPlace(place)}>
            <strong>{place.name}</strong>{place.details && <small>{place.details}</small>}
          </li>)}
        </ul>}
        {suggestionsOpen && lookup !== "idle" && <p className="card-sub" role="status">{lookup === "loading" ? (zh ? "正在搜索地点…" : "Searching for places…") : lookup === "empty" ? (zh ? "没有匹配地点，可试试加上城市名。" : "No matches. Try adding a city name.") : (zh ? "地点搜索暂不可用，可输入完整地址后重试。" : "Place search is unavailable. Try a full address.")}</p>}
      </div>
      {!running && <button type="submit" className="btn" disabled={!ready || !window.isSecureContext || !navigator.geolocation}>{zh ? "开始骑行导航" : "Start cycling navigation"}</button>}
    </form>
    {!window.isSecureContext && <p className="empty">{zh ? "请用 HTTPS 打开网页以使用定位。" : "Open this page over HTTPS to use geolocation."}</p>}
    {guidance && <canvas ref={preview} width="480" height="320" aria-hidden="true" />}
    <p className="card-sub" role="status" hidden={!status && !guidance}>{status || (guidance && `${formatDistance(guidance.progress.turn)} · ${guidance.progress.step || (zh ? "沿路线骑行" : "Follow the route")} · ${zh ? "剩余" : "Left"} ${formatDistance(guidance.progress.remaining)}`)}</p>
    {running && <div className="button-row">
      <button type="button" className="btn tonal" onClick={stop}>{zh ? "结束导航" : "End navigation"}</button>
      {panel === "idle" ? <button type="button" className="btn tonal" disabled={!guidance} onClick={sendToPanel}>{zh ? "在面板显示" : "Show on the panel"}</button>
        : <button type="button" className="btn tonal" onClick={() => stopPanel()}>{zh ? "停止面板显示" : "Stop panel display"}</button>}
    </div>}
    <p className="card-sub" role="status" hidden={panel === "idle" && !panelMessage}>{panel === "starting" ? (zh ? "正在连接面板…" : "Connecting to the panel…") : panel === "active" ? (zh ? "导航已显示在面板上" : "Navigation is shown on the panel") : panelMessage}</p>
  </div>;
}
