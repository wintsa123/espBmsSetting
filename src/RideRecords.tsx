import { useEffect, useMemo, useState, type CSSProperties } from "react";
import DashboardSheet from "./DashboardSheet";
import GpsTrackMap from "./GpsTrackMap";
import RideHistory from "./RideHistory";
import { dateKey, dated, distance, duration, rideSummary, ridesInRange, type RideData, type RideTrack } from "./ride-data";
import "./RideRecords.css";

export default function RideRecords({ open, onClose, language, connected, data, load }: {
  open: boolean; onClose: () => void; language: "zh" | "en"; connected: boolean; data: RideData; load: (path: string) => Promise<unknown>;
}) {
  const zh = language === "zh", now = new Date(), today = dateKey(now), currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth), [view, setView] = useState("month");
  const [day, setDay] = useState<string | null>(null), [trip, setTrip] = useState<number | null>(null), [fullMap, setFullMap] = useState(false);
  const [showZero, setShowZero] = useState(false), [batteryFor, setBatteryFor] = useState<number | null>(null);
  const [hoverMonth, setHoverMonth] = useState(currentMonth);
  useEffect(() => { if (open) { setDay(null); setTrip(null); setFullMap(false); } }, [open]);
  const selected = data.tracks.find(track => track.session.id === trip);
  const start = new Date(`${month}-01T00:00:00`), end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const days = useMemo(() => Array.from({ length: new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate() }, (_, index) => {
    const a = new Date(`${month}-${String(index + 1).padStart(2, "0")}T00:00:00`), b = new Date(a); b.setDate(b.getDate() + 1);
    const tracks = ridesInRange(data.tracks, a.getTime() / 1000, b.getTime() / 1000);
    return { date: dateKey(a), tracks, stats: rideSummary(tracks, a.getTime() / 1000, b.getTime() / 1000) };
  }), [month, data.tracks]);
  const yearDays = useMemo(() => Array.from({ length: 365 }, (_, index) => {
    const a = new Date(`${today}T00:00:00`); a.setDate(a.getDate() - 364 + index);
    const b = new Date(a); b.setDate(b.getDate() + 1);
    const tracks = ridesInRange(data.tracks, a.getTime() / 1000, b.getTime() / 1000);
    return { date: dateKey(a), stats: rideSummary(tracks, a.getTime() / 1000, b.getTime() / 1000) };
  }), [today, data.tracks]);
  const months = useMemo(() => [...new Set(yearDays.map(row => row.date.slice(0, 7)))].map(date => {
    const rows = yearDays.filter(row => row.date.startsWith(date));
    const known = rows.filter(row => row.stats.km !== null);
    return { date, km: known.length ? known.reduce((sum, row) => sum + row.stats.km!, 0) : null };
  }), [yearDays]);
  const uncalibrated = data.tracks.filter(track => !dated(track.session)), currentDay = days.find(row => row.date === day);
  const summary = selected ? rideSummary([selected]) : currentDay ? currentDay.stats : view === "year"
    ? rideSummary(data.tracks, new Date(`${yearDays[0].date}T00:00:00`).getTime() / 1000, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() / 1000)
    : rideSummary(data.tracks, start.getTime() / 1000, end.getTime() / 1000);
  const activeDays = (view === "year" ? yearDays : days).filter(row => (row.stats.km || 0) > 0).length;
  const clock = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString(zh ? "zh-CN" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const title = fullMap ? (zh ? "骑行轨迹" : "Ride track") : selected ? dated(selected.session) ? `${clock(selected.session.start_s)}–${clock(selected.session.start_s + selected.session.elapsed_s)}` : (zh ? "行程详情" : "Trip details") : day ? `${day.slice(5)} ${new Date(`${day}T00:00:00`).toLocaleDateString(zh ? "zh-CN" : "en-US", { weekday: "short" })}` : (zh ? "骑行记录" : "Ride records");
  const back = () => { if (fullMap) setFullMap(false); else if (trip !== null) setTrip(null); else if (day) setDay(null); else onClose(); };
  const monthLabel = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString(zh ? "zh-CN" : "en-US", { year: "numeric", month: "long" });
  const stepMonth = (offset: number) => setMonth(dateKey(new Date(start.getFullYear(), start.getMonth() + offset, 1)).slice(0, 7));
  const metric = (label: string, value: string, unit = "") => <div className="tile ride-metric"><span className="k">{label}</span><span className="v tnum">{value}<small>{unit}</small></span></div>;
  const level = (km: number | null) => !km || km <= 0 ? 0 : km <= 25 ? 1 : km <= 50 ? 2 : km <= 100 ? 3 : 4;
  const tripRow = (track: RideTrack) => {
    const session = track.session, stats = rideSummary([track]);
    return <button className="ride-trip-row" key={session.id} onClick={() => setTrip(session.id)}>
      <b className="ride-trip-time">{dated(session) ? `${clock(session.start_s)}–${clock(session.start_s + session.elapsed_s)}` : `#${session.id}`}</b>
      <span className="ride-trip-meta"><span>{duration(session.elapsed_s)}</span><span>{zh ? "最高" : "Max"} {distance(stats.max)} km/h</span></span>
      <span className="ride-trip-mile"><b>{distance(stats.km)}</b> km</span><span className="ride-row-tail" aria-hidden="true">›</span>
    </button>;
  };
  const monthDots = <div className="ride-contribution" aria-label={zh ? "本月骑行贡献图" : "Monthly ride contribution"}>
    <div className="ride-contribution-caption"><span>{zh ? "少" : "Less"}</span><span className="ride-legend">{[1, 2, 3, 4].map(value => <i key={value} className={`ride-l${value}`} />)}</span><span>{zh ? "多" : "More"}</span></div>
    <div className="ride-contribution-grid">{Array.from({ length: start.getDay() }, (_, i) => <span key={`gap-${i}`} className="ride-contribution-gap" aria-hidden="true" />)}{days.map(row => <span key={row.date} className={`ride-contribution-dot ride-l${level(row.stats.km)}${row.stats.km === null ? " ride-no-report" : ""}${row.date === today ? " ride-today" : ""}`} title={`${row.date} · ${distance(row.stats.km)} km`} aria-label={`${row.date} · ${distance(row.stats.km)} km`} aria-current={row.date === today ? "date" : undefined} />)}</div>
  </div>;
  const max = Math.max(1, ...months.map(row => row.km || 0)), rough = max / 3;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].find(value => value * power >= rough)! * power;
  const chartTop = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(chartTop / step) + 1 }, (_, index) => ({ value: Number((chartTop - index * step).toPrecision(10)), pos: index * step / chartTop * 100 }));
  const hovered = months.find(row => row.date === hoverMonth) || months[months.length - 1];
  const yearLead = (new Date(`${yearDays[0].date}T00:00:00`).getDay() + 6) % 7, yearCols = Math.ceil((365 + yearLead) / 7);
  return <DashboardSheet page open={open} title={title} closeLabel={zh ? "返回" : "Back"} onClose={back}>
    <div className={`ride-page esp-ride-page${fullMap ? " esp-ride-full-map" : ""}`}>
      {fullMap && selected ? <GpsTrackMap points={selected.points} language={language} /> : <>
        {!day && !selected && <>
          <div className="ride-toolbar"><div className="ride-switch" aria-label={zh ? "骑行统计范围" : "Ride statistics range"}>{["month", "year"].map(value => <button className={`ride-control${view === value ? " ride-selected" : ""}`} aria-pressed={view === value} key={value} onClick={() => setView(value)}>{value === "month" ? (zh ? "按月" : "Monthly") : (zh ? "近一年" : "Last year")}</button>)}</div>{view === "month" && <button className="ride-control" onClick={() => setMonth(currentMonth)}>{zh ? "本月" : "This month"}</button>}</div>
          {view === "month" && <div className="ride-monthbar"><button className="ride-control" aria-label={zh ? "上个月" : "Previous month"} onClick={() => stepMonth(-1)}>‹</button><h3 className="ride-monthlabel">{monthLabel(month)}</h3><button className="ride-control" aria-label={zh ? "下个月" : "Next month"} disabled={month >= currentMonth} onClick={() => stepMonth(1)}>›</button></div>}
        </>}
        {day || selected ? <>
          <div className="ride-primary-grid">{metric(zh ? "里程" : "Distance", distance(summary.km), "km")}{metric(zh ? "时长" : "Duration", duration(summary.seconds))}</div>
          <div className="ride-secondary ride-secondary-two">{metric(zh ? "最高车速" : "Maximum speed", distance(summary.max), "km/h")}{selected ? metric(zh ? "均速" : "Average", distance(summary.avg), "km/h") : metric(zh ? "行程段数" : "Trips", String(currentDay?.tracks.length || 0), zh ? "段" : "")}</div>
        </> : view === "month" ? <div className="ride-month-summary"><div className="ride-hero"><div className="ride-hero-main">{metric(zh ? "本月里程" : "Month distance", distance(summary.km), "km")}</div><div className="ride-secondary">{metric(zh ? "骑行天数" : "Ride days", String(activeDays), zh ? "天" : "days")}{metric(zh ? "骑行时长" : "Duration", duration(summary.seconds))}{metric(zh ? "最高车速" : "Maximum speed", distance(summary.max), "km/h")}</div></div>{monthDots}</div> : <>
          <div className="ride-hero"><div className="ride-hero-main">{metric(zh ? "近一年里程" : "Year distance", distance(summary.km), "km")}</div><div className="ride-secondary ride-secondary-two">{metric(zh ? "骑行天数" : "Ride days", String(activeDays), zh ? "天" : "days")}{metric(zh ? "骑行日均" : "Daily average", distance(activeDays && summary.km !== null ? summary.km / activeDays : null), "km")}</div></div>
        </>}
        {!connected && <p className="ride-state">{zh ? "连接设备后查看骑行记录" : "Connect to view ride recordings"}</p>}
        {data.loading && <p className="ride-caption" role="status">{zh ? "正在读取 ESP32 记录…" : "Reading ESP32 recordings…"}</p>}
        {data.error && <div className="ride-state ride-warning" role="alert"><span>{zh ? "记录读取失败，已读取的数据予以保留" : "Reading failed; loaded recordings have been kept"}</span><button className="ride-control" disabled={!connected || data.loading} onClick={() => void data.read()}>{zh ? "重试" : "Retry"}</button></div>}
        {data.more && !data.error && <div className="ride-state"><span>{zh ? "轨迹尚未读完，里程为已读部分" : "Partial track distance shown"}</span><button className="ride-control" disabled={!connected || data.loading} onClick={() => void data.read()}>{zh ? "继续读取轨迹" : "Load more track"}</button></div>}
        {selected ? <>
          <p className="ride-caption">{dated(selected.session) ? new Date(selected.session.start_s * 1000).toLocaleString(zh ? "zh-CN" : "en-US") : (zh ? "设备时间未校准" : "Device time uncalibrated")} · #{selected.session.id}</p>
          <div className="ride-section-head ride-track-head"><h3>{zh ? "轨迹" : "Ride track"}</h3><button className="ride-control" onClick={() => setFullMap(true)}>{zh ? "查看全图" : "Full map"}</button></div>
          <GpsTrackMap points={selected.points} language={language} />
          <p className="ride-caption">ESP32 · {selected.samples}/{selected.session.samples} {zh ? "条样本" : "samples"}{selected.session.truncated || selected.session.capacity_reached ? (zh ? " · 设备记录已截断" : " · Device recording truncated") : ""}</p>
          <details className="ride-fold" key={selected.session.id} onToggle={event => setBatteryFor(event.currentTarget.open ? selected.session.id : null)}><summary>{zh ? "电池曲线与故障日志" : "Battery charts and fault log"}</summary><div className="ride-fold-body">{batteryFor === selected.session.id && <RideHistory sessions={[selected.session]} language={language} load={load} />}</div></details>
        </> : day ? <>
          <h3 className="ride-section-title">{zh ? "行程" : "Trips"}</h3>
          <div className="ride-trip-list">{currentDay?.tracks.map(tripRow)}</div>
          {!currentDay?.tracks.length && <p className="ride-state">{zh ? "这一天没有设备骑行记录" : "No device recordings for this day"}</p>}
        </> : <>
          {view === "year" ? <>
            <p className="ride-caption">{yearDays[0].date} — {today} · {zh ? "365 天 · 日均按有骑行的天数计算" : "365 days · Average over ride days"}</p>
            <h3 className="ride-section-title">{zh ? "最近一年每天骑了多少" : "Daily distance over the last year"}</h3>
            <div className="ride-year-heat"><div className="hm"><div className="hm-months">{months.map(row => { const index = yearDays.findIndex(day => day.date.startsWith(row.date)); return <span key={row.date} style={{ left: `min(${Math.floor((index + yearLead) / 7) / yearCols * 100}%, calc(100% - 2.5em))` }}>{Number(row.date.slice(5))}{zh ? "月" : ""}</span>; })}</div><div className="hm-grid" style={{ gridTemplateColumns: `repeat(${yearCols}, minmax(0, 1fr))`, gridTemplateRows: "repeat(7, auto)" }}>{yearDays.map((row, index) => <span className={`c l${level(row.stats.km)}`} key={row.date} title={`${row.date} · ${distance(row.stats.km)} km`} style={{ gridColumn: Math.floor((index + yearLead) / 7) + 1, gridRow: (index + yearLead) % 7 + 1 }} />)}</div><div className="hm-legend"><span>{zh ? "少" : "Less"}</span>{[0, 1, 2, 3, 4].map(value => <i key={value} className={`c l${value}`} />)}<span>{zh ? "多" : "More"}</span></div></div></div>
            <section className="ride-month-chart" aria-label={zh ? "每月里程" : "Monthly distance"} style={{ "--ride-month-count": months.length } as CSSProperties}>
              <div className="ride-month-head"><div className="ride-month-meta"><h3>{zh ? "每月里程" : "Monthly distance"}</h3><span className="ride-month-selected">{monthLabel(hovered.date)}</span></div><div className="ride-month-value"><b>{distance(hovered.km)}</b><span>km</span></div></div>
              <div className="ride-month-body"><div className="ride-month-axis" aria-hidden="true">{ticks.map(tick => <span key={tick.value} style={{ top: `${tick.pos}%` }}>{tick.value}</span>)}</div><div className="ride-month-columns"><div className="ride-month-guides" aria-hidden="true">{ticks.map(tick => <i key={tick.value} style={{ top: `${tick.pos}%` }} />)}</div><div className="ride-ybars">{months.map(row => <button className={`ride-ybar${row.km ? "" : " ride-ybar-zero"}${hovered.date === row.date ? " ride-ybar-active" : ""}`} key={row.date} aria-label={`${row.date} · ${distance(row.km)} km`} onPointerEnter={() => setHoverMonth(row.date)} onFocus={() => setHoverMonth(row.date)} onClick={() => { setMonth(row.date); setView("month"); }}><span className="ride-ybar-track" aria-hidden="true"><i style={{ height: `${(row.km || 0) / chartTop * 100}%` }} /></span><span className="ride-ybar-mon">{Number(row.date.slice(5))}</span></button>)}</div><div className="ride-month-years">{[...new Set(months.map(row => row.date.slice(0, 4)))].map(year => <span key={year} style={{ gridColumn: `${months.findIndex(row => row.date.startsWith(year)) + 1} / span ${months.filter(row => row.date.startsWith(year)).length}` }}>{year}</span>)}</div></div></div>
            </section>
          </> : <>
            <div className="ride-section-head"><h3>{zh ? "每日记录" : "Daily records"}</h3><button className="ride-control" aria-pressed={showZero} onClick={() => setShowZero(!showZero)}>{showZero ? (zh ? "仅骑行日" : "Ride days") : (zh ? "含零里程" : "All reported days")} · {days.filter(row => row.tracks.length && (showZero || row.stats.km === null || row.stats.km > 0)).length}</button></div>
            <div className="ride-day-list">{days.filter(row => row.tracks.length && (showZero || row.stats.km === null || row.stats.km > 0)).reverse().map(row => <button className="ride-day-row" key={row.date} onClick={() => setDay(row.date)}><span className="ride-day-info"><span className="ride-day-date"><b>{row.date.slice(5)}</b><span>{new Date(`${row.date}T00:00:00`).toLocaleDateString(zh ? "zh-CN" : "en-US", { weekday: "short" })}</span></span><span className="ride-day-meta"><span>{zh ? "时长" : "Duration"} {duration(row.stats.seconds)}</span><span>{zh ? "最高" : "Max"} {distance(row.stats.max)} km/h</span></span></span><span className="ride-day-mile"><b>{distance(row.stats.km)}</b><span>km</span></span><span className="ride-row-tail" aria-hidden="true">›</span></button>)}</div>
            {!days.some(row => row.tracks.length) && <p className="ride-state">{zh ? "这个月没有设备骑行记录" : "No device recordings for this month"}</p>}
          </>}
          {!!uncalibrated.length && <><h3 className="ride-section-title">{zh ? "未校准时间的行程" : "Trips without calibrated time"}</h3><div className="ride-trip-list">{uncalibrated.map(tripRow)}</div></>}
          <p className="ride-caption">{zh ? "仅汇总 ESP32 仍保存的记录，里程及车速根据有效 GPS 轨迹估算。" : "Summarizes records retained by ESP32. Distance and speed are estimated from valid GPS samples."}</p>
        </>}
      </>}
    </div>
  </DashboardSheet>;
}
