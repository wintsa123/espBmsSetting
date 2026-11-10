import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./DashboardSheet.css";

type DashboardSheetProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
};

const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export default function DashboardSheet({ open, title, subtitle, closeLabel = "关闭", onClose, children }: DashboardSheetProps) {
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const openRef = useRef(open);
  closeRef.current = onClose;
  openRef.current = open;
  const titleId = useId();
  const subtitleId = useId();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => { setHost(document.getElementById("phone")); }, []);

  useLayoutEffect(() => {
    if (open && !present) setPresent(true);
  }, [open, present]);

  useLayoutEffect(() => {
    if (!present) return;
    let frame = 0;
    let timer = 0;
    if (open) {
      frame = requestAnimationFrame(() => {
        // Commit the hidden position before starting the source CSS transition.
        if (sheetRef.current) void sheetRef.current.offsetHeight;
        setVisible(true);
      });
    } else {
      setVisible(false);
      const styles = sheetRef.current && getComputedStyle(sheetRef.current);
      const seconds = (value: string) => value.split(",").map(part => parseFloat(part) * (part.trim().endsWith("ms") ? 1 : 1000));
      const durations = seconds(styles?.transitionDuration || "0s");
      const delays = seconds(styles?.transitionDelay || "0s");
      const duration = Math.max(...durations.map((value, index) => value + delays[index % delays.length]));
      timer = window.setTimeout(() => setPresent(false), duration + 50);
    }
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [open, present]);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!present || !host || !sheet) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(host.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== sheet && node !== scrimRef.current);
    const inertStates = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    const scroll = host.querySelector<HTMLElement>("#scroll");
    const locked = [document.body, ...(scroll ? [scroll] : [])].map(node => ({ node, overflow: node.style.getPropertyValue("overflow"), priority: node.style.getPropertyPriority("overflow"), top: node.scrollTop }));
    locked.forEach(({ node }) => node.style.setProperty("overflow", "hidden"));
    const focusables = () => Array.from(sheet.querySelectorAll<HTMLElement>(focusableSelector)).filter(node => node.tabIndex >= 0 && !node.closest("[inert]") && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden");
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); sheet.focus({ preventScroll: true }); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet || !sheet.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet || !sheet.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const focusin = (event: FocusEvent) => {
      if (!sheet.contains(event.target as Node)) (focusables()[0] || sheet).focus({ preventScroll: true });
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      siblings.forEach((node, index) => { node.inert = inertStates[index]; });
      locked.forEach(({ node, overflow, priority, top }) => {
        if (overflow) node.style.setProperty("overflow", overflow, priority);
        else node.style.removeProperty("overflow");
        node.scrollTop = top;
      });
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus({ preventScroll: true });
    };
  }, [present, host]);

  useLayoutEffect(() => {
    if (visible) sheetRef.current?.focus({ preventScroll: true });
  }, [visible]);

  if (!present || !host) return null;
  return createPortal(<>
    <div ref={scrimRef} className={`scrim dashboard-sheet-scrim${visible ? " show" : ""}`} aria-hidden="true" onClick={() => closeRef.current()} />
    <div ref={sheetRef} className={`sheet half dashboard-sheet${visible ? " show" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined} tabIndex={-1} onTransitionEnd={event => {
      if (event.target === event.currentTarget && event.propertyName === "transform" && !openRef.current) setPresent(false);
    }}>
      <div className="grab" aria-hidden="true" />
      <div className="sheet-head">
        <div className="dashboard-sheet-heading"><div className="sheet-title" id={titleId}>{title}</div>{subtitle && <div className="sheet-sub" id={subtitleId}>{subtitle}</div>}</div>
        <button className="iconbtn" type="button" aria-label={closeLabel} onClick={() => closeRef.current()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  </>, host);
}
