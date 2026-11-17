import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import DashboardSheet from "./DashboardSheet";
import "./HomeDashboard.css";

export type HomeCard = { id: string; title: string; content: ReactNode; width?: number; height?: number; initial?: boolean };
type Placement = { id: string; width: number; height: number };
const storageKey = "bms.dashboard.home-layout.v1";
const defaultLayout = (cards: HomeCard[]): Placement[] => cards.filter(card => card.initial).map(card => ({ id: card.id, width: card.width || 2, height: card.height || 1 }));
export function parseHomeLayout(raw: string | null, fallback: Placement[]): Placement[] {
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 200) return fallback;
    const ids = new Set<string>();
    return value.filter((item): item is Placement => {
      if (!item || typeof item.id !== "string" || item.id.length > 100 || ids.has(item.id) || ![2, 4].includes(item.width) || !Number.isInteger(item.height) || item.height < 1 || item.height > 5) return false;
      ids.add(item.id); return true;
    });
  } catch { return fallback; }
}

type Point = { x: number; y: number; id: string };
type Gesture = { id: string; kind: "move" | "pinch"; x: number; y: number; rect: DOMRect; width: number; height: number; distance: number; scale: number };

export default function HomeDashboard({ cards, language, active, editing, onEditingChange }: { cards: HomeCard[]; language: "zh" | "en"; active: boolean; editing: boolean; onEditingChange: (editing: boolean) => void }) {
  const zh = language === "zh";
  const [layout, setLayout] = useState<Placement[]>(() => {
    let saved = defaultLayout(cards);
    try {
      saved = parseHomeLayout(localStorage.getItem(storageKey), saved);
      // 给旧布局补加一次投屏入口，保留用户后续的删除和排序。
      const cast = cards.find(card => card.id === "cast");
      if (cast && !localStorage.getItem(`${storageKey}.cast`)) {
        if (!saved.some(item => item.id === cast.id)) saved = [...saved, { id: cast.id, width: cast.width || 2, height: cast.height || 1 }];
        localStorage.setItem(storageKey, JSON.stringify(saved));
        localStorage.setItem(`${storageKey}.cast`, "1");
      }
    } catch { /* 存储不可用时仍显示已读取的布局。 */ }
    return saved;
  });
  const [draft, setDraft] = useState<Placement[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [moving, setMoving] = useState("");
  const [resizing, setResizing] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const press = useRef<{ timer: number; x: number; y: number } | undefined>(undefined);
  const points = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | undefined>(undefined);
  const positions = useRef<Map<string, DOMRect> | undefined>(undefined);
  const frame = useRef(0);
  const suppress = useRef(false);
  const shown = draft || layout;
  const nodes = () => [...(grid.current?.querySelectorAll<HTMLElement>("[data-home-id]") || [])];
  const captureLayout = () => { positions.current = new Map(nodes().map(node => [node.dataset.homeId!, node.firstElementChild!.getBoundingClientRect()])); };
  const cancelPress = () => { if (press.current) window.clearTimeout(press.current.timer); press.current = undefined; };
  const clearGesture = () => {
    cancelPress(); cancelAnimationFrame(frame.current); gesture.current = undefined;
    nodes().forEach(node => (node.firstElementChild as HTMLElement).style.removeProperty("transform"));
    setMoving(""); setResizing("");
  };
  const edit = (id = "") => { captureLayout(); setDraft(layout.map(item => ({ ...item }))); setSelected(id); setError(""); onEditingChange(true); };
  const paintGesture = () => {
    const current = gesture.current;
    const node = nodes().find(node => node.dataset.homeId === current?.id);
    if (!current || !node) return;
    const shell = node.firstElementChild as HTMLElement;
    if (current.kind === "pinch") shell.style.transform = `scale(${current.scale})`;
    else {
      const point = [...points.current.values()][0]; if (!point) return;
      const bounds = node.getBoundingClientRect();
      shell.style.transform = `translate(${point.x - current.x + current.rect.left - bounds.left}px,${point.y - current.y + current.rect.top - bounds.top}px) scale(1.035)`;
    }
  };
  useLayoutEffect(() => {
    const previous = positions.current; positions.current = undefined;
    if (previous) nodes().forEach(node => {
      const shell = node.firstElementChild as HTMLElement, from = previous.get(node.dataset.homeId!), to = node.getBoundingClientRect();
      shell.getAnimations().forEach(animation => animation.cancel());
      if (!from || !to.width || !to.height || node.dataset.homeId === moving || node.dataset.homeId === resizing || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      shell.animate([{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    paintGesture();
  }, [shown, editing, moving, resizing]);
  useEffect(() => {
    if (editing && !draft) setDraft(layout.map(item => ({ ...item })));
    if (!editing) { clearGesture(); points.current.clear(); setDraft(null); setAdding(false); }
  }, [editing]);
  useEffect(() => { if (!active) { clearGesture(); points.current.clear(); setDraft(null); setAdding(false); onEditingChange(false); } }, [active]);
  useEffect(() => {
    const root = grid.current;
    const preventScroll = (event: TouchEvent) => { if (editing || gesture.current) event.preventDefault(); };
    root?.addEventListener("touchmove", preventScroll, { passive: false });
    return () => root?.removeEventListener("touchmove", preventScroll);
  }, [editing]);
  useEffect(() => () => { cancelPress(); cancelAnimationFrame(frame.current); }, []);
  const changeDraft = (change: (items: Placement[]) => Placement[]) => { captureLayout(); setDraft(items => change(items || layout)); };
  const beginMove = (item: Placement, point: Point) => {
    const node = nodes().find(node => node.dataset.homeId === item.id); if (!node) return;
    node.firstElementChild!.getAnimations().forEach(animation => animation.cancel());
    gesture.current = { id: item.id, kind: "move", x: point.x, y: point.y, rect: node.getBoundingClientRect(), width: item.width, height: item.height, distance: 0, scale: 1 };
    suppress.current = true; setSelected(item.id); setMoving(item.id); paintGesture();
    const scrollFrame = () => {
      if (gesture.current?.kind !== "move") return;
      const scroll = grid.current?.closest<HTMLElement>("#scroll"), pointer = [...points.current.values()][0];
      if (scroll && pointer) {
        const bounds = scroll.getBoundingClientRect();
        if (pointer.y > bounds.bottom - 70) scroll.scrollTop += 12;
        else if (pointer.y < bounds.top + 100) scroll.scrollTop -= 12;
        paintGesture();
      }
      frame.current = requestAnimationFrame(scrollFrame);
    };
    frame.current = requestAnimationFrame(scrollFrame);
  };
  const beginPress = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("input,textarea,select,[data-no-home-press],.home-toolbar,.home-delete")) return;
    const id = (event.target as Element).closest<HTMLElement>("[data-home-id]")?.dataset.homeId || "";
    const point = { x: event.clientX, y: event.clientY, id };
    points.current.set(event.pointerId, point);
    if (editing && id) event.currentTarget.setPointerCapture(event.pointerId);
    cancelPress();
    const touches = [...points.current.values()];
    if (touches.length > 1) {
      if (!editing || !id || touches.length !== 2 || touches.some(touch => touch.id !== id)) return;
      clearGesture(); const item = shown.find(item => item.id === id), node = nodes().find(node => node.dataset.homeId === id);
      if (!item || !node) return;
      gesture.current = { id, kind: "pinch", x: point.x, y: point.y, rect: node.getBoundingClientRect(), width: item.width, height: item.height, distance: Math.max(1, Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y)), scale: 1 };
      suppress.current = true; setSelected(id); setResizing(id); return;
    }
    if (editing && !id) return;
    const capture = event.currentTarget;
    press.current = { x: point.x, y: point.y, timer: window.setTimeout(() => {
      cancelPress(); suppress.current = true;
      if (!editing) edit(id);
      const item = shown.find(item => item.id === id);
      if (item) { capture.setPointerCapture(event.pointerId); beginMove(item, point); }
    }, editing ? 350 : 550) };
  };
  const moveGesture = (event: PointerEvent) => {
    const previous = points.current.get(event.pointerId); if (!previous) return;
    points.current.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
    if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 8) cancelPress();
    const current = gesture.current;
    if (!current) {
      if (editing && event.pointerType === "touch" && previous.id && points.current.size === 1) {
        const scroll = grid.current?.closest<HTMLElement>("#scroll"); if (scroll) scroll.scrollTop -= event.clientY - previous.y;
      }
      return;
    }
    if (current.kind === "pinch") {
      const touches = [...points.current.values()];
      if (touches.length === 2) current.scale = Math.max(.4, Math.min(2.5, Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y) / current.distance));
    }
    paintGesture();
  };
  const endGesture = (event: PointerEvent, canceled = false) => {
    cancelPress(); const current = gesture.current;
    if (current) {
      captureLayout();
      if (!canceled && current.kind === "pinch") {
        const width = Math.max(2, Math.min(4, Math.round(current.width * current.scale / 2) * 2));
        const height = Math.max(1, Math.min(5, Math.round(current.height * current.scale)));
        setDraft(items => (items || layout).map(item => item.id === current.id ? { ...item, width, height } : item));
      } else if (!canceled) {
        let target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-home-id]")?.dataset.homeId;
        const bounds = grid.current?.getBoundingClientRect();
        if (!target && bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top) {
          let nearest = Infinity;
          nodes().forEach(node => {
            const rect = node.getBoundingClientRect(), distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
            if (distance < nearest) { nearest = distance; target = node.dataset.homeId; }
          });
        }
        setDraft(items => {
          const next = [...(items || layout)], from = next.findIndex(item => item.id === current.id), to = next.findIndex(item => item.id === target);
          if (from >= 0 && to >= 0 && from !== to) next.splice(to, 0, next.splice(from, 1)[0]);
          return next;
        });
      }
      clearGesture();
    }
    points.current.delete(event.pointerId);
    if (!points.current.size) window.setTimeout(() => { suppress.current = false; }, 0);
  };
  const closeEdit = () => { captureLayout(); clearGesture(); points.current.clear(); setDraft(null); setError(""); onEditingChange(false); };
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(draft)); setLayout(draft!); closeEdit(); } catch { setError(zh ? "保存失败，请检查本机存储空间" : "Could not save; check local storage"); } };
  return <div className={`home-dashboard${editing ? " editing" : ""}`} data-home-editing={editing} onPointerDownCapture={beginPress} onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) { cancelPress(); points.current.delete(event.pointerId); } }} onPointerMove={moveGesture} onPointerUp={event => endGesture(event)} onPointerCancel={event => endGesture(event, true)} onLostPointerCapture={event => { if (points.current.has(event.pointerId)) endGesture(event, true); }} onContextMenu={event => { event.preventDefault(); if (!editing) edit((event.target as Element).closest<HTMLElement>("[data-home-id]")?.dataset.homeId); }} onClickCapture={event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); suppress.current = false; } }}>
    {editing && <div className="home-toolbar"><strong>{zh ? "编辑首页" : "Edit home"}</strong><button className="btn tonal" onClick={() => setAdding(true)}>{zh ? "新增卡片" : "Add card"}</button><button className="btn tonal" onClick={closeEdit}>{zh ? "取消" : "Cancel"}</button><button className="btn" onClick={save}>{zh ? "完成" : "Done"}</button></div>}
    {error && <p role="alert">{error}</p>}
    <div className="home-grid" ref={grid}>
      {shown.map(item => { const card = cards.find(card => card.id === item.id); if (!card) return null; return <div key={item.id} data-home-id={item.id} className={`home-widget${selected === item.id && editing ? " selected" : ""}${moving === item.id ? " moving" : ""}${resizing === item.id ? " resizing" : ""}`} style={{ gridColumn: `span ${item.width}`, gridRow: `span ${item.height}` }}>
        <div className="home-widget-shell">
          <div className="home-widget-content" inert={editing}>{card.content}</div>
          {editing && <div className="home-widget-editor"><span className="home-widget-title">{card.title}</span><button type="button" className="home-delete quiet" aria-label={`${zh ? "删除" : "Remove"} ${card.title}`} onClick={() => changeDraft(items => items.filter(row => row.id !== item.id))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg></button></div>}
        </div>
      </div>; })}
    </div>
    <div className="home-background" aria-label={zh ? "首页空白区域" : "Home background"} />
    <DashboardSheet page open={adding} title={zh ? "添加卡片" : "Add cards"} closeLabel={zh ? "返回" : "Back"} onClose={() => setAdding(false)}><div className="home-card-library">{cards.map(card => { const exists = shown.some(item => item.id === card.id); return <button className="card quiet" key={card.id} disabled={exists} onClick={() => { changeDraft(items => [...items, { id: card.id, width: card.width || 2, height: card.height || 1 }]); setSelected(card.id); setAdding(false); }}><strong>{card.title}</strong><span>{exists ? (zh ? "已添加" : "Added") : (zh ? "+ 添加到首页" : "+ Add to home")}</span></button>; })}</div></DashboardSheet>
  </div>;
}
