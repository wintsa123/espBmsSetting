// Ported from dashboard/public/js/ui.js at 35aa033; only rendering helpers, no vehicle APIs.
const paths: Record<string, string> = {
  "bolt": "<path d=\"M13.2 2.8 5.6 13.2h5l-1.4 8L18 10.6h-5.2l.4-7.8z\"/>",
  "refresh": "<path d=\"M20 12a8 8 0 1 1-2.4-5.7\"/><path d=\"M20 4.2v5h-5\"/>",
  "gear": "<path d=\"M9.90 5.32 L10.21 2.36 L13.79 2.36 L14.10 5.32 L15.23 5.79 L17.55 3.92 L20.08 6.45 L18.21 8.77 L18.68 9.90 L21.64 10.21 L21.64 13.79 L18.68 14.10 L18.21 15.23 L20.08 17.55 L17.55 20.08 L15.23 18.21 L14.10 18.68 L13.79 21.64 L10.21 21.64 L9.90 18.68 L8.77 18.21 L6.45 20.08 L3.92 17.55 L5.79 15.23 L5.32 14.10 L2.36 13.79 L2.36 10.21 L5.32 9.90 L5.79 8.77 L3.92 6.45 L6.45 3.92 L8.77 5.79Z\"/><circle cx=\"12\" cy=\"12\" r=\"3.2\"/>",
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4\"/>",
  "auto": "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><path d=\"M12 3.4v17.2\"/><path d=\"M12 3.4a8.6 8.6 0 0 1 0 17.2z\" fill=\"currentColor\" stroke=\"none\"/>",
  "moon": "<path d=\"M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z\"/>",
  "download": "<path d=\"M12 3.6v10.8\"/><path d=\"m7.6 10.4 4.4 4.4 4.4-4.4\"/><path d=\"M4.6 19.4h14.8\"/>",
  "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>",
  "right": "<path d=\"m9.5 6.5 5.5 5.5-5.5 5.5\"/>",
  "battery": "<rect x=\"3\" y=\"7.5\" width=\"15.5\" height=\"9\" rx=\"2.6\"/><path d=\"M21 11v2\"/><path d=\"M6.5 10v4\"/>",
  "speed": "<path d=\"M3.6 17.4a9 9 0 1 1 16.8 0\"/><path d=\"m12 17.4 4.2-6.6\"/>",
  "gauge": "<rect x=\"3.4\" y=\"5\" width=\"17.2\" height=\"14\" rx=\"3\"/><path d=\"M7.4 15.2a5.2 5.2 0 0 1 9.2 0\"/><path d=\"m12 15.2 2.6-3.4\"/>",
  "route": "<circle cx=\"6\" cy=\"18\" r=\"2.2\"/><circle cx=\"18\" cy=\"6\" r=\"2.2\"/><path d=\"M8.2 18h5.3a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h5.8\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"8.4\"/><path d=\"M12 7.4V12l3.2 2\"/>"
};

export function dashboardIcon(name: string, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.gauge}</svg>`;
}

export function fallbackScooter(anim: boolean, phase = 0) {
    const delay = phase > 0 ? `animation-delay:-${Math.round(phase)}ms;` : '';
    return `<svg class="fallback${anim ? ' hero-in' : ''}" viewBox="0 0 320 180" width="320" height="180" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--md-sys-color-on-surface-variant);opacity:.9;${delay}">
      <circle cx="66" cy="132" r="26"/><circle cx="66" cy="132" r="9"/>
      <circle cx="252" cy="132" r="26"/><circle cx="252" cy="132" r="9"/>
      <path d="M92 132h134"/>
      <path d="M118 132c-10-18 2-38 22-46l30-10c14-5 30-2 40 8l18 18"/>
      <path d="M150 76h72c10 0 18 8 18 18v16"/>
      <path d="M196 76l10-28h26"/>
      <path d="M226 48h18"/>
      <path d="M92 132c-4-14-2-26 4-34h30c8 0 14 6 14 14v20"/>
      <path d="M240 76h22"/>
    </svg>`;
  }

export function socBar(pct: number, color: string, charging: boolean, grow: boolean | number = false) {
    const w = Math.max(0, Math.min(pct ?? 0, 100));
    const cls = grow === false || grow === null ? '' : ' grow';
    const delay = typeof grow === 'number' && grow > 0 ? `animation-delay:-${Math.round(grow)}ms` : '';
    return `<div class="bar${charging ? ' charging' : ''}${cls}" style="--bar-c:${color};--bar-w:${w}%"><i style="width:${w}%${delay ? ';' + delay : ''}"></i></div>`;
  }

const BARS_SLOTS = 7;
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export function bars(days: { date: string; mile: number; day: number }[], unit: string, rise: number | null = null) {
    const list = Array.isArray(days) ? days : [];
    const max = Math.max(1, ...list.map((d) => d.mile));
    const pad = Math.max(0, BARS_SLOTS - list.length);
    // 空槽只占宽度：没有柱子、没有日期、没有 title。
    const blanks = Array.from({ length: pad }, () => '<div class="b blank" aria-hidden="true"></div>').join('');
    return `<div class="bars${rise === null ? '' : ' rise'}">${blanks}${list.map((d, i) => `
      <div class="b${i === list.length - 1 ? ' today' : ''}" title="${esc(d.date)} · ${esc(d.mile)} ${esc(unit)}">
        <i style="height:${Math.max(3, Math.round((d.mile / max) * 100))}%${rise === null ? '' : `;animation-delay:${Math.round((i + pad) * 45 - rise)}ms`}"></i>
        <span>${esc(d.day)}</span>
      </div>`).join('')}</div>`;
  }
