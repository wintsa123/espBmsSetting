/** ThemeSheet/editThemeSheet port from dashboard/public/js/app.js; colors from its theme-source.mjs. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { dashboardIcon } from './vendor/dashboard-parts';
import * as T from './vendor/dashboard-theme-engine.js';
import type { Appearance, CustomColors, ThemePreferences } from './vendor/dashboard-theme-engine.js';

const STORAGE_KEY = 'bms.dashboard.theme';
const accentNames = ['Purple', 'Blue', 'Yellow', 'Red', 'Pink', 'Green', 'Multicolor 1', 'Multicolor 2'];
const styleNames: Record<string, string> = {
  'tonal-spot': 'Android 12+ · Classic soft', spritz: 'Android 13+ · Low saturation',
  vibrant: 'Android 13+ · Vibrant', expressive: 'Android 13+ · Expressive',
  rainbow: 'Android 13+ · Rainbow', 'fruit-salad': 'Android 13+ · Two-tone',
  monochromatic: 'Android 14+ · Monochrome',
};

export function readThemePreferences(): ThemePreferences {
  try { return T.normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  catch { return T.normalize(); }
}

export function saveThemePreferences(preferences: ThemePreferences): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...preferences, themeV: 2, accentV: 2 })); }
  catch { /* The current theme remains usable when browser storage is unavailable. */ }
}

function Icon({ name }: { name: string }) {
  // Original ui.js paths not needed by the device's main navigation helpers.
  const paths: Record<string, string> = {
    edit: '<path d="m15 5 4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20z"/>',
    left: '<path d="m14.5 6.5-5.5 5.5 5.5 5.5"/>',
    close: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
    check: '<path d="m5.2 12.6 4.6 4.6L19 7.2"/>',
  };
  const svg = paths[name] ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>` : dashboardIcon(name, 18);
  return <span className="dashboard-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function ThemeButton({ language = 'zh' }: { language?: 'zh' | 'en' }) {
  const en = language === 'en';
  const [preferences, setPreferences] = useState(readThemePreferences);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T.CustomColors | null>(null);
  const [inputs, setInputs] = useState({ primary: '', secondary: '', tertiary: '' });
  const [systemLight, setSystemLight] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const active = draft ? { ...preferences, accent: 'custom', customColors: draft } : preferences;

  useEffect(() => {
    T.apply(active);
    const query = matchMedia('(prefers-color-scheme: light)');
    const update = () => { setSystemLight(query.matches); T.apply(active); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [preferences, draft]);

  useEffect(() => {
    if (!open || !host || !sheet.current) return;
    const siblings = Array.from(host.children).filter(node => node !== sheet.current && !node.classList.contains('dashboard-theme-scrim'));
    const before = siblings.map(node => [node, node.hasAttribute('inert')] as const);
    siblings.forEach(node => node.setAttribute('inert', ''));
    const focusables = () => [...sheet.current!.querySelectorAll<HTMLElement>('button, input, summary, [tabindex="0"]')].filter(node => !node.closest('details:not([open])') || node.tagName === 'SUMMARY');
    (sheet.current.querySelector<HTMLElement>('.theme-sheet-close') || sheet.current).focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (draft) setDraft(null); else setOpen(false); }
      if (event.key !== 'Tab') return;
      const nodes = focusables(), first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    host.addEventListener('keydown', keyboard);
    return () => {
      host.removeEventListener('keydown', keyboard);
      before.forEach(([node, wasInert]) => node.toggleAttribute('inert', wasInert));
      if (!draft) trigger.current?.focus({ preventScroll: true });
    };
  }, [open, host, !!draft]);

  const choose = (next: ThemePreferences) => { setPreferences(next); saveThemePreferences(next); };
  const close = () => { if (draft) setDraft(null); else setOpen(false); };
  const edit = () => {
    const colors = T.custom(preferences.customColors);
    setInputs({ primary: colors.primary, secondary: colors.secondary || '', tertiary: colors.tertiary || '' });
    setDraft(colors);
  };
  const valid = Object.entries(inputs).every(([name, value]) => !!T.hex(value.trim()) || (name !== 'primary' && !value.trim()));
  const updateInput = (name: keyof typeof inputs, value: string) => {
    const next = { ...inputs, [name]: value };
    setInputs(next);
    if (Object.entries(next).every(([key, color]) => T.hex(color.trim()) || (key !== 'primary' && !color.trim()))) {
      setDraft(T.custom({ ...draft!, ...Object.fromEntries(Object.entries(next).map(([key, color]) => [key, color.trim() || null])) }));
    }
  };
  const palette = T.colors({ ...preferences, accent: 'custom', customColors: draft || preferences.customColors }, false);
  const field = (name: 'primary' | 'secondary' | 'tertiary', label: string, automatic = false) => <div className="theme-color-field">
    <label htmlFor={`theme-${name}`}>{label}</label>
    <div className="theme-color-inputs">
      <input type="color" aria-label={`${label}${en ? ' picker' : '取色器'}`} value={T.hex(inputs[name]) || palette[name]} onChange={e => updateInput(name, e.target.value)} />
      <input id={`theme-${name}`} data-hex={name} value={inputs[name]} placeholder={automatic ? (en ? 'Automatic' : '自动生成') : '#7457b8'} maxLength={7} autoComplete="off" spellCheck={false} aria-invalid={!T.hex(inputs[name]) && !(automatic && !inputs[name])} aria-describedby="theme-edit-error" onChange={e => updateInput(name, e.target.value)} />
      {automatic && <button type="button" className="btn text small" onClick={() => updateInput(name, '')}>{en ? 'Auto' : '自动'}</button>}
    </div>
  </div>;
  const modes: [Appearance, string, string, string][] = [
    ['system', en ? 'Follow system' : '跟随系统', en ? `System is ${systemLight ? 'light' : 'dark'} · changes with your phone` : `现在系统是${systemLight ? '浅色' : '深色'} · 随手机自动切`, 'auto'],
    ['light', en ? 'Light' : '浅色', en ? 'Always use light mode' : '一直用浅色', 'sun'],
    ['dark', en ? 'Dark' : '深色', en ? 'Always use dark mode' : '一直用深色', 'moon'],
  ];

  return <>
    <button ref={trigger} type="button" className="iconbtn theme-trigger" aria-label={en ? 'Theme' : '主题'} aria-haspopup="dialog" aria-expanded={open} title={en ? 'Theme' : '主题'} onClick={event => { setHost(event.currentTarget.closest<HTMLElement>('#phone') || document.body); setOpen(true); }}><Icon name={preferences.theme === 'system' ? 'auto' : preferences.theme === 'light' ? 'sun' : 'moon'} /></button>
    {host && createPortal(<>
      <div className={`scrim dashboard-theme-scrim${open ? ' show' : ''}`} aria-hidden="true" onClick={close} />
      <div ref={sheet} className={`sheet dashboard-theme-sheet${open ? ' show' : ''}`} role="dialog" aria-modal={open ? true : undefined} aria-labelledby="theme-sheet-title" tabIndex={-1}>
        <div className="grab" aria-hidden="true" />
        <div className="sheet-head"><div><div className="sheet-title" id="theme-sheet-title">{draft ? (en ? 'Edit theme' : '编辑主题') : (en ? 'Theme' : '主题')}</div><div className="sheet-sub">{draft ? (en ? 'Adjust colors with a live global preview' : '调整颜色，实时预览全局效果') : (en ? 'Appearance · Accent color' : '深浅模式 · 主题色')}</div></div><button type="button" className="iconbtn theme-sheet-close" aria-label={draft ? (en ? 'Cancel editing' : '取消编辑') : (en ? 'Close theme' : '关闭主题')} onClick={close}><Icon name={draft ? 'left' : 'close'} /></button></div>
        <div className="sheet-body" key={draft ? 'edit' : 'presets'}>
          {draft ? <form className="theme-editor" onSubmit={event => { event.preventDefault(); if (!valid) return; choose({ ...preferences, accent: 'custom', customColors: draft }); setDraft(null); }}>
            {field('primary', en ? 'Primary color' : '主色')}
            <div className="theme-random-row"><button type="button" className="btn tonal" onClick={() => { const next = T.randomCustom(draft); setDraft(next); setInputs({ primary: next.primary, secondary: '', tertiary: '' }); }}>{en ? 'Random' : '随机'}</button><span className="theme-random-label" aria-live="polite">{en ? styleNames[draft.style] : T.androidStyles.find(style => style.id === draft.style)?.label}</span></div>
            <details><summary>{en ? 'Additional colors' : '辅助颜色'}</summary>{field('secondary', en ? 'Secondary accent' : '第二强调色', true)}{field('tertiary', en ? 'Tertiary accent' : '第三强调色', true)}</details>
            <div className="theme-preview" aria-label={en ? 'Theme preview' : '主题预览'}><span className="theme-preview-primary">{en ? 'Primary' : '主色'}</span><span className="theme-preview-secondary">{en ? 'Secondary' : '辅助'}</span><span className="theme-preview-tertiary">{en ? 'Tertiary' : '点缀'}</span></div>
            <p id="theme-edit-error" className="theme-edit-error" role="status" aria-live="polite">{!valid && (en ? 'Enter a color in #RRGGBB format, such as #7457b8' : '请输入 #RRGGBB 格式的颜色，例如 #7457b8')}</p>
            <div className="theme-edit-actions"><button type="button" className="btn text" onClick={() => setDraft(null)}>{en ? 'Cancel' : '取消'}</button><button type="submit" className="btn" disabled={!valid}>{en ? 'Save' : '保存'}</button></div>
          </form> : <>
            {modes.map(([mode, title, subtitle, icon]) => <button type="button" key={mode} className={`sheet-item${preferences.theme === mode ? ' sel' : ''}`} aria-pressed={preferences.theme === mode} onClick={() => choose({ ...preferences, theme: mode })}><span className="ico"><Icon name={icon} /></span><div><div className="t">{title}</div><div className="s">{subtitle}</div></div>{preferences.theme === mode && <span className="tail"><Icon name="check" /></span>}</button>)}
            <div className="section-title accent-title"><span>{en ? 'Accent color' : '主题色'}</span><span className="line" /></div>
            <div className="accent-grid">{T.presets.map(({ v, t }, index) => {
              const c = T.colors({ ...preferences, accent: v }, false);
              const fill = v.startsWith('multi-') ? `conic-gradient(${c.primary} 0 25%,${c.secondary} 25% 50%,${c.tertiary} 50% 75%,${c['surface-container-highest']} 75%)` : c['primary-container'];
              return <button type="button" key={v} className={`accent-sw${preferences.accent === v ? ' sel' : ''}`} aria-label={en ? accentNames[index] : t} aria-pressed={preferences.accent === v} title={en ? accentNames[index] : t} style={{ '--sw-bg': fill, '--sw-ink': c['on-primary-container'] } as CSSProperties} onClick={() => choose({ ...preferences, accent: v })}><span className="dot">{preferences.accent === v && <span className="sw-check"><Icon name="check" /></span>}</span><span className="lb">{en ? accentNames[index] : t}</span></button>;
            })}<button type="button" className={`accent-sw${preferences.accent === 'custom' ? ' sel' : ''}`} aria-label={en ? 'Edit custom theme' : '编辑自定义主题'} aria-pressed={preferences.accent === 'custom'} style={{ '--sw-bg': palette['primary-container'], '--sw-ink': palette['on-primary-container'] } as CSSProperties} onClick={edit}><span className="dot"><Icon name="edit" /></span><span className="lb">{en ? 'Edit' : '编辑'}</span></button></div>
          </>}
        </div>
      </div>
    </>, host)}
  </>;
}
