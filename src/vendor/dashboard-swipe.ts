/** Horizontal page gestures from lswlc33/dashboard 7c413f0 public/js/ui.js.
 * React adaptations: typed DOM, mount cleanup, previews from existing pages.
 */
import { flushSync } from "react-dom";

export function bindHorizontalPages(root: HTMLElement, { current, items, enabled, select, preview = () => null, progress = () => {} }: {
  current: () => string; items: string[]; enabled: () => boolean; select: (tab: string) => void;
  preview?: (tab: string) => string | null; progress?: (position: number | null) => void;
}): () => void {
    let start: { x: number; y: number; tab: string; axis: string; width: number; direction: number } | null = null;
    let dx = 0, suppressClick = false, mouse: number | null = null, neighbor: HTMLElement | null = null, frame = 0;
    const removers: (() => void)[] = [];
    function listen<K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions | boolean) {
      root.addEventListener(type, handler, options);
      removers.push(() => root.removeEventListener(type, handler, options));
    }
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0;
      root.style.transform = ''; root.classList.remove('is-swiping');
      neighbor?.remove(); neighbor = null;
      if (start?.axis === 'x') progress(null);
      start = null; dx = 0;
    };
    const paint = (offset: number) => {
      if (!start) return;
      root.style.transform = `translateX(${offset}px)`;
      if (neighbor) neighbor.style.transform = `translateX(${offset + start.direction * start.width}px)`;
      const index = items.indexOf(start.tab);
      progress(Math.max(0, Math.min(items.length - 1, index - offset / start.width)));
    };
    const prepare = (direction: number) => {
      if (!start) return;
      if (start.direction === direction) return;
      start.direction = direction;
      neighbor?.remove(); neighbor = null;
      const next = items[items.indexOf(start.tab) + direction];
      const html = next && preview(next);
      if (html == null) return;
      neighbor = root.cloneNode(false) as HTMLElement;
      neighbor.removeAttribute('id'); neighbor.dataset.page = next;
      neighbor.classList.add('main-swipe-neighbor');
      neighbor.inert = true; neighbor.setAttribute('aria-hidden', 'true');
      neighbor.innerHTML = html;
      // 预览只有视觉作用，避免同名 id 被全局查询误选中。
      neighbor.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      root.parentElement?.append(neighbor);
    };
    const begin = (event: Event, points: ArrayLike<{ clientX: number; clientY: number }>) => {
      reset(); suppressClick = false;
      if (!enabled() || points.length !== 1 || (event.target as Element).closest('input, textarea, select, a, [contenteditable], canvas, .leaflet-container, .action, .cap-wrap')) return;
      for (let node = event.target as HTMLElement | null; node && node !== root; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
      }
      start = { x: points[0].clientX, y: points[0].clientY, tab: current(), axis: '', width: root.clientWidth, direction: 0 };
    };
    const move = (event: Event, points: ArrayLike<{ clientX: number; clientY: number }>) => {
      if (!start) return;
      if (!enabled() || current() !== start.tab || points.length !== 1) { reset(); return; }
      const x = points[0].clientX - start.x, y = points[0].clientY - start.y;
      if (!start.axis) {
        if (Math.max(Math.abs(x), Math.abs(y)) < 12) return;
        if (Math.abs(x) > Math.abs(y) * 1.5) { start.axis = 'x'; root.classList.add('is-swiping'); }
        else if (Math.abs(y) > Math.abs(x) * 1.5) { reset(); return; }
        else return;
      }
      suppressClick = true;
      const index = items.indexOf(start.tab), next = index + (x < 0 ? 1 : -1);
      prepare(x < 0 ? 1 : -1);
      dx = Math.max(-start.width, Math.min(start.width, x));
      if (next < 0 || next >= items.length) dx /= 4;
      paint(dx);
      if (event.cancelable) event.preventDefault();
    };
    const finish = (event: Event, cancelled = false) => {
      if (start?.axis !== 'x') { reset(); return; }
      if (event.cancelable) event.preventDefault();
      const tab = start.tab, offset = dx, next = items[items.indexOf(tab) + start.direction];
      const commit = !cancelled && enabled() && current() === tab && next && Math.abs(offset) >= 72;
      const target = commit ? -start.direction * start.width : 0, began = performance.now();
      const complete = () => {
        if (commit && enabled() && current() === tab) {
          select(next);
          root.querySelector('.page')?.classList.remove('page-fwd', 'page-back');
        }
        reset();
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { complete(); return; }
      const step = (now: number) => {
        if (!enabled() || current() !== tab) { reset(); return; }
        const t = Math.max(0, Math.min(1, (now - began) / 180)), eased = 1 - Math.pow(1 - t, 3);
        paint(offset + (target - offset) * eased);
        if (t < 1) frame = requestAnimationFrame(step); else complete();
      };
      frame = requestAnimationFrame(step);
    };
    listen('touchstart', event => begin(event, event.touches), { passive: true });
    listen('touchmove', event => move(event, event.touches), { passive: false });
    listen('touchend', event => finish(event));
    listen('touchcancel', event => finish(event, true));
    listen('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      begin(event, [event]); if (start) mouse = event.pointerId;
    });
    listen('pointermove', event => {
      if (mouse !== event.pointerId) return;
      move(event, [event]);
      if (start?.axis === 'x') root.setPointerCapture?.(event.pointerId);
    });
    listen('pointerup', event => { if (mouse === event.pointerId) { mouse = null; finish(event); } });
    for (const type of ['pointercancel', 'lostpointercapture'] as const) listen(type, event => {
      if (mouse !== null && event.pointerId === mouse) { mouse = null; finish(event, true); }
    });
    listen('dragstart', event => { if (start) event.preventDefault(); });
    listen('click', event => {
      if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
    }, true);
    const interrupt = () => { mouse = null; reset(); };
    window.addEventListener('resize', interrupt);
    window.addEventListener('blur', interrupt);
    return () => {
      removers.forEach(remove => remove());
      window.removeEventListener('resize', interrupt);
      window.removeEventListener('blur', interrupt);
      interrupt();
    };
  }

/** Keep React as the owner of all live pages; inert snapshots are visual only. */
export function bindDashboardPages(phone: HTMLElement): () => void {
  const root = phone.querySelector<HTMLElement>('#scroll');
  const bar = phone.querySelector<HTMLElement>('#tabbar');
  const indicator = bar?.querySelector<HTMLElement>('.tab-ind');
  if (!root || !bar || !indicator) return () => {};
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('.tab[data-tab]')];
  const items = buttons.map(button => button.dataset.tab!);
  const current = () => bar.querySelector<HTMLElement>('.tab.sel')?.dataset.tab || items[0];
  return bindHorizontalPages(root, {
    current, items,
    enabled: () => !root.inert && !phone.querySelector('.scrim.show, .sheet.show, [aria-modal="true"]'),
    select: tab => {
      phone.dataset.swipeCommit = tab;
      flushSync(() => buttons[items.indexOf(tab)]?.click());
    },
    preview: tab => {
      const page = root.querySelectorAll<HTMLElement>(':scope > .panel')[items.indexOf(tab)];
      if (!page) return null;
      const snapshot = page.cloneNode(true) as HTMLElement;
      snapshot.classList.add('active');
      snapshot.classList.remove('page-fwd', 'page-back');
      snapshot.removeAttribute('id');
      snapshot.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      return snapshot.outerHTML;
    },
    progress: position => {
      const dragging = position !== null;
      bar.classList.toggle('is-swiping', dragging);
      indicator.classList.toggle('noanim', dragging);
      if (position === null) {
        indicator.style.transform = `translateX(calc(${items.indexOf(current())} * (100% + var(--tab-gap))))`;
        buttons.forEach(button => button.style.removeProperty('--tab-active'));
        return;
      }
      buttons.forEach((button, index) => button.style.setProperty('--tab-active', String(Math.max(0, 1 - Math.abs(position - index)))));
      const wave = Math.sin(Math.PI * (position % 1));
      indicator.style.transform = `translateX(calc(${position} * (100% + var(--tab-gap)))) scaleX(${1 + .16 * wave}) scaleY(${1 - .06 * wave})`;
    },
  });
}
