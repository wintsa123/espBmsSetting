import { useEffect, useMemo, useRef, useState } from 'react';

export type RideSession = {
  id: number; start_s: number; end_s?: number; elapsed_s: number; samples: number;
  calibrated: boolean; truncated: boolean; capacity_reached?: boolean;
};
type Sample = {
  t: number; elapsed_s: number; flags: number;
  pack_voltage_mv: number | null; current_deci_amps: number | null; soc_percent: number | null;
};
type Fault = { t: number; session: number; active_mask: number; supported_mask: number; bms_type: number };
type Page<T> = { rows: T[]; cursor: number | null; loading: boolean; error: string };
export type HistoryState = { session?: RideSession; samples: Page<Sample>; faults: Page<Fault> };
type Loader = (path: string) => Promise<unknown>;
const emptyPage = <T,>(): Page<T> => ({ rows: [], cursor: null, loading: false, error: '' });
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown): value is number => numeric(value) && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function parsePage(value: unknown, kind: 'samples' | 'faults'): { rows: (Sample | Fault)[]; cursor: number | null } {
  if (!object(value) || !Array.isArray(value[kind]) || (value.next_cursor != null && !integer(value.next_cursor))) throw new Error('invalid-history-response');
  const rows = (value[kind] as unknown[]).map(row => {
    if (!object(row) || !integer(row.t)) throw new Error('invalid-history-response');
    if (kind === 'samples') {
      if (!integer(row.elapsed_s) || !integer(row.flags)) throw new Error('invalid-history-response');
      return { t: row.t, elapsed_s: row.elapsed_s, flags: row.flags,
        pack_voltage_mv: numeric(row.pack_voltage_mv) ? row.pack_voltage_mv : null,
        current_deci_amps: numeric(row.current_deci_amps) ? row.current_deci_amps : null,
        soc_percent: numeric(row.soc_percent) ? row.soc_percent : null } as Sample;
    }
    if (![row.session, row.active_mask, row.supported_mask, row.bms_type].every(integer)) throw new Error('invalid-history-response');
    return { t: row.t, session: row.session, active_mask: row.active_mask, supported_mask: row.supported_mask, bms_type: row.bms_type } as Fault;
  });
  return { rows, cursor: value.next_cursor == null ? null : value.next_cursor as number };
}

/** Uses the same samples/faults contract as Android DeviceApi, including BLE's 8/20 page limits. */
export function createHistoryReader(load: Loader, changed: (state: HistoryState) => void) {
  let generation = 0;
  let state: HistoryState = { samples: emptyPage(), faults: emptyPage() };
  const publish = () => changed(state);
  const fetchPage = async (kind: 'samples' | 'faults', more: boolean) => {
    const session = state.session;
    const page = state[kind];
    if (!session || page.loading || (more && page.cursor === null)) return;
    const token = generation;
    const cursor = more ? page.cursor : null;
    state = { ...state, [kind]: { ...page, loading: true, error: '' } };
    publish();
    const params = new URLSearchParams({ session: String(session.id), from: kind === 'faults' && session.calibrated ? String(session.start_s) : '0',
      to: kind === 'faults' && session.calibrated && integer(session.end_s) && session.end_s >= session.start_s ? String(session.end_s) : '9223372036854775807', limit: kind === 'samples' ? '8' : '20' });
    if (cursor !== null) params.set('cursor', String(cursor));
    try {
      const result = parsePage(await load(`/api/history/${kind}?${params}`), kind);
      if (token !== generation) return;
      if (kind === 'faults' && result.rows.some(row => (row as Fault).session !== session.id)) throw new Error('invalid-history-response');
      const old = more ? state[kind].rows : [];
      const rows = Array.from(new Map([...old, ...result.rows].map(row => [kind === 'samples' ? `${row.t}:${(row as Sample).elapsed_s}` : `${row.t}:${(row as Fault).session}:${(row as Fault).active_mask}:${(row as Fault).supported_mask}`, row])).values());
      const next = result.rows.length && result.cursor !== null && (cursor === null || result.cursor > cursor) ? result.cursor : null;
      state = { ...state, [kind]: { rows, cursor: next, loading: false, error: '' } };
    } catch (error) {
      if (token !== generation) return;
      state = { ...state, [kind]: { ...state[kind], loading: false, error: error instanceof Error ? error.message : 'history-request-failed' } };
    }
    publish();
  };
  return {
    async select(session?: RideSession) {
      generation++;
      state = { session, samples: emptyPage(), faults: emptyPage() };
      publish();
      if (session) await Promise.all([fetchPage('samples', false), fetchPage('faults', false)]);
    },
    samples: () => fetchPage('samples', state.samples.rows.length > 0),
    faults: () => fetchPage('faults', state.faults.rows.length > 0),
    dispose() { generation++; },
  };
}

export function HistoryPlot({ samples, field, divisor, label, unit }: { samples: Sample[]; field: 'pack_voltage_mv' | 'current_deci_amps' | 'soc_percent'; divisor: number; label: string; unit: string }) {
  const values = samples.map(sample => (sample.flags & 2) && numeric(sample[field]) ? sample[field]! / divisor : null);
  const valid = values.filter(numeric);
  if (!valid.length) return <p className="empty">{label} —</p>;
  const low = Math.min(...valid), high = Math.max(...valid), span = Math.max(high - low, 1 / divisor);
  const first = Math.min(...samples.map(sample => sample.elapsed_s)), last = Math.max(...samples.map(sample => sample.elapsed_s));
  const segments: string[][] = [[]];
  values.forEach((value, index) => {
    if (value === null) { if (segments[segments.length - 1].length) segments.push([]); return; }
    const x = 52 + (samples[index].elapsed_s - first) / Math.max(last - first, 1) * 292;
    const y = 88 - (value - low) / span * 64;
    segments[segments.length - 1].push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });
  const decimals = divisor === 1000 ? 2 : divisor === 10 ? 1 : 0;
  return <figure className="ride-history-plot">
    <figcaption>{label} <strong className="tnum">{valid[valid.length - 1].toFixed(decimals)} {unit}</strong></figcaption>
    <svg viewBox="0 0 360 116" role="img" aria-label={`${label} · ${low.toFixed(decimals)}–${high.toFixed(decimals)} ${unit}`}>
      <path d="M52 20V92H348" fill="none" stroke="var(--md-sys-color-outline-variant)" />
      <text x="2" y="28" fill="currentColor" fontSize="10">{high.toFixed(decimals)}</text><text x="2" y="90" fill="currentColor" fontSize="10">{low.toFixed(decimals)}</text>
      <text x="52" y="110" fill="currentColor" fontSize="10">{first}s</text><text x="344" y="110" textAnchor="end" fill="currentColor" fontSize="10">{last}s</text>
      {segments.filter(segment => segment.length > 0).map((segment, index) => segment.length === 1
        ? <circle key={index} cx={segment[0].split(',')[0]} cy={segment[0].split(',')[1]} r="3" fill="var(--md-sys-color-primary)" />
        : <polyline key={index} points={segment.join(' ')} fill="none" stroke="var(--md-sys-color-primary)" strokeWidth="2.5" />)}
    </svg>
  </figure>;
}

export default function RideHistory({ sessions, language, load }: { sessions: RideSession[]; language: 'zh' | 'en'; load: Loader }) {
  const en = language === 'en';
  const sorted = [...sessions].sort((a, b) => b.id - a.id);
  const [selected, setSelected] = useState<number | undefined>(sorted[0]?.id);
  const [state, setState] = useState<HistoryState>({ samples: emptyPage(), faults: emptyPage() });
  const loadRef = useRef(load); loadRef.current = load;
  const reader = useMemo(() => createHistoryReader(path => loadRef.current(path), setState), []);
  const session = sorted.find(item => item.id === selected) || sorted[0];
  useEffect(() => { void reader.select(session); return () => reader.dispose(); }, [reader, session?.id, session?.calibrated, session?.start_s, session?.end_s]);
  const shown = state.session?.id === session?.id ? state : { samples: emptyPage<Sample>(), faults: emptyPage<Fault>() };
  const error = (message: string) => message === 'invalid-history-response' ? (en ? 'The device returned an invalid history response' : '设备返回的历史数据格式不正确') : `${en ? 'History request failed' : '历史读取失败'}：${message}`;
  const time = (timestamp: number) => session?.calibrated ? new Date(timestamp * 1000).toLocaleString(en ? 'en-US' : 'zh-CN') : `${en ? 'Uncalibrated time' : '未校准时间'} · ${timestamp}s`;
  return <div className="ride-history">
    {!session ? <p className="empty">{en ? 'No driving history sessions' : '暂无行驶历史会话'}</p> : <>
      <label>{en ? 'Session' : '行驶会话'}<select aria-label={en ? 'Session' : '行驶会话'} value={session.id} onChange={event => setSelected(Number(event.target.value))}>{sorted.map(item => <option key={item.id} value={item.id}>#{item.id} · {Math.floor(item.elapsed_s / 60)}m {item.elapsed_s % 60}s{!item.calibrated ? (en ? ' · Uncalibrated' : ' · 未校准') : ''}</option>)}</select></label>
      <p className="empty">{session.samples} {en ? 'recorded samples' : '条已记录样本'}{session.truncated ? (en ? ' · Truncated' : ' · 已截断') : ''}{session.capacity_reached ? (en ? ' · Capacity reached' : ' · 容量已满') : ''}</p>
      <section className="card"><h3>{en ? 'BMS history' : 'BMS 历史曲线'}</h3>
        <p className="empty">{shown.samples.rows.length} {en ? 'samples loaded · horizontal axis is elapsed seconds' : '条已加载样本 · 横轴为本次行驶秒数'}</p>
        <HistoryPlot samples={shown.samples.rows} field="pack_voltage_mv" divisor={1000} label={en ? 'Battery voltage' : '电池电压'} unit="V" />
        <HistoryPlot samples={shown.samples.rows} field="current_deci_amps" divisor={10} label={en ? 'Battery current' : '电池电流'} unit="A" />
        <HistoryPlot samples={shown.samples.rows} field="soc_percent" divisor={1} label="SOC" unit="%" />
        {shown.samples.error && <p className="message" role="alert">{error(shown.samples.error)}</p>}
        {!shown.samples.loading && !shown.samples.error && !shown.samples.rows.length && <p className="empty">{en ? 'No samples in this session' : '此会话暂无样本'}</p>}
        {(shown.samples.cursor !== null || shown.samples.error) && <button className="btn tonal" type="button" disabled={shown.samples.loading} onClick={() => void reader.samples()}>{shown.samples.error ? (en ? 'Retry samples' : '重试读取样本') : (en ? 'Load more samples' : '加载后续样本')}</button>}
        {shown.samples.loading && <p role="status">{en ? 'Loading samples…' : '正在读取样本…'}</p>}
      </section>
      <section className="card"><h3>{en ? 'Fault log' : '故障日志'}</h3>
        {shown.faults.rows.map((fault, index) => <div className="ride-history-fault" key={`${fault.t}:${index}`}><strong>{time(fault.t)}</strong><p>{fault.active_mask === 0 ? (en ? 'Faults cleared' : '故障已清除') : `${en ? 'Active' : '活动故障'} 0x${fault.active_mask.toString(16).padStart(4, '0')}`} · {en ? 'Supported' : '支持'} 0x{fault.supported_mask.toString(16).padStart(4, '0')} · BMS {fault.bms_type}</p></div>)}
        {shown.faults.error && <p className="message" role="alert">{error(shown.faults.error)}</p>}
        {!shown.faults.loading && !shown.faults.error && !shown.faults.rows.length && <p className="empty">{en ? 'No fault changes in this session' : '此会话暂无故障变化'}</p>}
        {(shown.faults.cursor !== null || shown.faults.error) && <button className="btn tonal" type="button" disabled={shown.faults.loading} onClick={() => void reader.faults()}>{shown.faults.error ? (en ? 'Retry faults' : '重试读取故障') : (en ? 'Load more faults' : '加载后续故障')}</button>}
        {shown.faults.loading && <p role="status">{en ? 'Loading faults…' : '正在读取故障…'}</p>}
      </section>
    </>}
  </div>;
}
