/**
 * Ported from lswlc33/dashboard public/js/ui.js (animNums, motion, loadBar,
 * press feedback) and public/js/app.js (placeTabInd,
 * updateTopbarScroll/updateTopbarBlur, measureTop, render entrance lifecycle).
 * Source revision is recorded in the adjacent DASHBOARD_SOURCE.md.
 * Adaptations: DOM root replaces global S/$; React owns page nodes; all pending
 * frames/listeners/animations belong to the mount and are released on cleanup.
 */
type MotionState = {
  lastNums: Map<string, number>;
  frames: Map<HTMLElement, number>;
  animations: Set<Animation>;
  tab?: string;
  scrollFrame: number;
  loadTimer?: ReturnType<typeof setTimeout>;
  loadShownAt: number;
  enteredAt: number;
  busy?: boolean;
  cleanup: () => void;
};

const mounts = new WeakMap<HTMLElement, MotionState>();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ui.js motion: original easing and default duration.
function motion(state: MotionState, el: HTMLElement | null, frames: Keyframe[], duration = 180) {
  if (!el?.animate || reduced()) return null;
  const animation = el.animate(frames, { duration, easing: 'cubic-bezier(.2,0,0,1)' });
  state.animations.add(animation);
  animation.finished.then(() => state.animations.delete(animation), () => state.animations.delete(animation));
  return animation;
}

// ui.js animNums: retain target decimals, stable keys, phase and easeOutCubic.
function animNums(state: MotionState, scope: HTMLElement, fromZero: boolean) {
  if (state.lastNums.size > 400) state.lastNums.clear();
  const reduce = reduced();
  const dur = fromZero ? 760 : 480;
  scope.querySelectorAll<HTMLElement>('[data-num]').forEach(el => {
    const raw = el.dataset.num;
    const key = el.dataset.key;
    if (!key || raw === '' || raw == null) return;
    const to = Number(raw);
    if (!Number.isFinite(to)) return;
    const prev = fromZero ? 0 : state.lastNums.get(key);
    state.lastNums.set(key, to);
    if (prev === to && state.frames.has(el) && !fromZero) return;
    const pending = state.frames.get(el);
    if (pending !== undefined) cancelAnimationFrame(pending);
    state.frames.delete(el);
    if (el.hasAttribute('data-num-static') || prev === undefined || prev === to || reduce) {
      el.textContent = raw;
      return;
    }
    const dec = (String(raw).split('.')[1] || '').length;
    const show = (v: number) => { el.textContent = v.toFixed(dec); };
    const t0 = fromZero ? state.enteredAt : performance.now();
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      const v = prev + (to - prev) * (1 - Math.pow(1 - k, 3));
      show(v);
      if (k < 1) state.frames.set(el, requestAnimationFrame(step));
      else { show(to); state.frames.delete(el); }
    };
    state.frames.set(el, requestAnimationFrame(step));
  });
}

// app.js placeTabInd: original equal-slot CSS transform; number of tabs is DOM-owned.
function placeTabInd(phone: HTMLElement, tab: string, animate: boolean) {
  const bar = phone.querySelector<HTMLElement>('#tabbar');
  const ind = bar?.querySelector<HTMLElement>('.tab-ind');
  if (!bar || !ind) return;
  const index = [...bar.querySelectorAll<HTMLElement>('.tab[data-tab]')].findIndex(button => button.dataset.tab === tab);
  if (index < 0) { ind.style.opacity = '0'; return; }
  if (!animate || reduced()) ind.classList.add('noanim');
  ind.style.opacity = '1';
  ind.style.transform = `translateX(calc(${index} * (100% + var(--tab-gap))))`;
  if (!animate || reduced()) { void ind.offsetWidth; ind.classList.remove('noanim'); }
}

// app.js updateTopbarScroll/updateTopbarBlur: same clamp, 1px tolerance and bottom veil.
function updateTopbarScroll(phone: HTMLElement) {
  const sc = phone.querySelector<HTMLElement>('#scroll');
  const bar = phone.querySelector<HTMLElement>('#topbar');
  if (!sc || !bar) return;
  const y = Math.max(0, sc.scrollTop || 0);
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const compact = max > 0 && Math.max(0, Math.min(y, max)) > 1 && !bar.classList.contains('is-boot');
  bar.classList.toggle('is-compact', compact);
  const controls = bar.querySelector<HTMLElement>('.topbar-controls');
  const title = bar.querySelector<HTMLElement>('.topbar-page-title');
  if (controls) { controls.toggleAttribute('inert', compact); controls.setAttribute('aria-hidden', String(compact)); }
  if (title) {
    title.textContent = phone.querySelector('.tab.sel .tab-label')?.textContent || '';
    title.setAttribute('aria-hidden', String(!compact));
  }
  phone.querySelector('#tabbar')?.classList.toggle('is-compact', compact);
  const bottomVeil = max - y <= 1 ? 0 : 1;
  phone.style.setProperty('--tabbar-veil', String(bottomVeil));
  phone.classList.toggle('has-tabveil', bottomVeil > 0);
}

export function bindDashboardMotion(phone: HTMLElement): () => void {
  mounts.get(phone)?.cleanup();
  const state: MotionState = { lastNums: new Map(), frames: new Map(), animations: new Set(), scrollFrame: 0, loadShownAt: 0, enteredAt: 0, cleanup: () => {} };
  mounts.set(phone, state);
  const sc = phone.querySelector<HTMLElement>('#scroll');
  const topbar = phone.querySelector<HTMLElement>('#topbar');
  // app.js measureTop: measure the actual header for the scroll area's inset.
  const measureTop = () => {
    if (topbar && (topbar.firstElementChild || topbar.classList.contains('is-boot'))) {
      phone.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
    }
  };
  const topbarObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(measureTop) : undefined;
  if (topbar) topbarObserver?.observe(topbar);
  measureTop();
  const schedule = () => {
    if (state.scrollFrame) return;
    state.scrollFrame = requestAnimationFrame(() => { state.scrollFrame = 0; updateTopbarScroll(phone); });
  };
  const press = (event: Event) => {
    const el = (event.target as Element)?.closest<HTMLElement>('button, [role="button"], [data-act], [data-t], summary');
    if (!el || el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return;
    if (el.closest('.action, .cap-wrap, .wall-section')) return;
    motion(state, el, [{ opacity: 1 }, { opacity: .65 }, { opacity: 1 }], 200);
  };
  sc?.addEventListener('scroll', schedule, { passive: true });
  phone.addEventListener('pointerdown', press, { passive: true });
  const resize = () => { measureTop(); schedule(); };
  window.addEventListener('resize', resize);
  state.cleanup = () => {
    sc?.removeEventListener('scroll', schedule);
    phone.removeEventListener('pointerdown', press);
    window.removeEventListener('resize', resize);
    topbarObserver?.disconnect();
    cancelAnimationFrame(state.scrollFrame);
    for (const frame of state.frames.values()) cancelAnimationFrame(frame);
    state.frames.clear();
    for (const animation of state.animations) animation.cancel();
    state.animations.clear();
    clearTimeout(state.loadTimer);
    if (mounts.get(phone) === state) mounts.delete(phone);
  };
  updateTopbarScroll(phone);
  return state.cleanup;
}

export function updateDashboardMotion(phone: HTMLElement, tab: string, { busy }: { busy: boolean }): void {
  if (!mounts.has(phone)) bindDashboardMotion(phone);
  const state = mounts.get(phone)!;
  const changed = state.tab !== tab;
  const first = state.tab === undefined;
  const page = phone.querySelector<HTMLElement>('#scroll > .panel.active');
  placeTabInd(phone, tab, !first);
  if (page && changed) {
    state.enteredAt = performance.now();
    const tabs = [...phone.querySelectorAll<HTMLElement>('#tabbar .tab[data-tab]')].map(button => button.dataset.tab);
    const forward = tabs.indexOf(tab) > tabs.indexOf(state.tab);
    page.classList.remove('page-fwd', 'page-back');
    if (!first && !reduced()) { void page.offsetWidth; page.classList.add(forward ? 'page-fwd' : 'page-back'); }
    const sc = phone.querySelector<HTMLElement>('#scroll');
    if (sc) sc.scrollTop = 0;
    if (!reduced()) for (const [selector, name] of [['.hero-in', 'hero-in'], ['.bar.grow', 'grow'], ['.bars.rise', 'rise']]) {
      for (const el of page.querySelectorAll<HTMLElement>(selector)) {
        el.classList.remove(name);
        void el.offsetWidth;
        el.classList.add(name);
      }
    }
  }
  if (page) animNums(state, page, changed || performance.now() - state.enteredAt < 2400);
  state.tab = tab;
  // ui.js loadBar: preserve its 260ms minimum visibility and 8s watchdog.
  if (busy !== state.busy) {
    const bar = phone.querySelector('#loadbar');
    clearTimeout(state.loadTimer);
    if (busy) {
      state.loadShownAt = Date.now();
      bar?.classList.add('on');
      state.loadTimer = setTimeout(() => bar?.classList.remove('on'), 8000);
    } else {
      const rest = Math.max(0, 260 - (Date.now() - state.loadShownAt));
      state.loadTimer = setTimeout(() => bar?.classList.remove('on'), rest);
    }
    state.busy = busy;
  }
  updateTopbarScroll(phone);
}
