import { dateKey, distance, duration, rideSummary, type RideData } from "./ride-data";
import { dashboardIcon } from "./vendor/dashboard-parts";
import "./RideRecords.css";
export { readTrackPage } from "./ride-data";

export default function GpsRideCard({ language, connected, data, onHistory }: {
  language: "zh" | "en"; connected: boolean; data: RideData; onHistory: () => void;
}) {
  const zh = language === "zh", now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = rideSummary(data.tracks, month.getTime() / 1000, new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() / 1000);
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(today); start.setDate(start.getDate() - 6 + index);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { date: start, ...rideSummary(data.tracks, start.getTime() / 1000, end.getTime() / 1000) };
  });
  const max = Math.max(1, ...days.map(day => day.km || 0));
  const metrics = [[zh ? "今日" : "Today", distance(days[6].km), "km"], [zh ? "本月" : "This month", distance(stats.km), "km"], [zh ? "时长" : "Duration", duration(stats.seconds), ""], [zh ? "均速" : "Average", distance(stats.avg), "km/h"]];
  return <button type="button" className="card ride-card esp-recent-rides quiet" aria-label={zh ? "最近骑行，查看全部记录" : "Recent rides, view all records"} onClick={onHistory}>
    <span className="card-head"><strong className="esp-ride-heading"><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: dashboardIcon("route", 16) }} />{zh ? "最近骑行" : "Recent rides"}</strong><span className="ride-row-tail" aria-hidden="true">›</span></span>
    <span className="grid2">{metrics.map(([label, value, unit]) => <span className="tile" key={label}><span className="k">{label}</span><span className="v tnum">{connected ? value : "—"}<small>{unit}</small></span></span>)}</span>
    <span className="bars rise" aria-label={zh ? "近七天 GPS 里程" : "GPS distance over the last seven days"}>{days.map((day, index) => <span className={`b${index === 6 ? " today" : ""}`} key={dateKey(day.date)} title={`${dateKey(day.date)} · ${distance(day.km)} km`}><i style={{ height: `${Math.max(3, Math.round((day.km || 0) / max * 100))}%`, animationDelay: `${index * 45}ms` }} /><span>{day.date.getDate()}</span></span>)}</span>
    {(!connected || data.loading || data.error || data.more) && <span className="ride-caption">{!connected ? (zh ? "连接设备后自动读取" : "Connect to load recordings") : data.loading ? (zh ? "正在读取 ESP32 记录…" : "Reading ESP32 recordings…") : data.error ? (zh ? "记录读取失败，点击查看" : "Could not read records; tap for details") : data.more ? (zh ? "部分轨迹已读取" : "Partial tracks loaded") : ""}</span>}
  </button>;
}
