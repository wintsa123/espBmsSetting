export default function GpsStatus({ language, status }: { language: "zh" | "en"; status: Record<string, unknown> }) {
  const zh = language === "zh";
  const available = status.gps_satellite_info_valid === true;
  const number = (key: string) => typeof status[key] === "number" && Number.isFinite(status[key]) ? status[key] as number : undefined;
  const dimension = number("gps_fix_dimension");
  const mask = number("gps_constellation_mask");
  const used = number("gps_satellites_used"), visible = number("gps_satellites_visible");
  const snr = number("gps_average_cn0"), hdop = number("gps_hdop_centi");
  let fix = status.gps_fix == null ? "—" : status.gps_fix ? (zh ? "已定位" : "Fix acquired") : (zh ? "无效定位" : "No fix");
  if (available && status.gps_fix && (dimension === 2 || dimension === 3)) fix = dimension === 3 ? (zh ? "3D 定位，测速精准" : "3D fix, accurate speed") : (zh ? "2D 定位，测速偏差大" : "2D fix, speed less accurate");
  const systems: Record<number, string> = zh ? {1:"单 GPS",2:"北斗 单模",3:"GPS+北斗 双模",4:"GLONASS 单模",5:"GPS+GLONASS 双模",6:"北斗+GLONASS 双模",7:"GPS+BDS+GLONASS 三模"} : {1:"GPS only",2:"BDS only",3:"GPS+BDS",4:"GLONASS only",5:"GPS+GLONASS",6:"BDS+GLONASS",7:"GPS+BDS+GLONASS"};
  const rows = [
    [zh ? "定位模式" : "Fix mode", fix],
    [zh ? "卫星系统" : "Satellite system", available && mask !== undefined && systems[mask] ? systems[mask] : status.gps_fix ? (zh ? "等待卫星信息" : "Waiting for satellite data") : (zh ? "等待搜星" : "Waiting for fix")],
    [zh ? "卫星" : "Satellites in view", available && visible !== undefined && used !== undefined ? (zh ? `${visible} 可见 / ${used} 有效${used < 5 ? "，少于5颗不稳" : "，测速稳定"}` : `${visible} visible / ${used} used${used < 5 ? "; <5 sats, unstable" : "; speed stable"}`) : "—"],
    [zh ? "平均 SNR 信噪比" : "Avg SNR", available && snr !== undefined ? `${snr} dBHz${zh ? "，越大越好" : ", higher is better"}${snr < 10 ? (zh ? "，信号差易漂移" : "; poor signal, drifts") : ""}` : "—"],
    ["HDOP", available && status.gps_hdop_valid === true && hdop !== undefined ? `${(hdop / 100).toFixed(2)}${hdop < 150 ? (zh ? "，优秀" : "; excellent") : hdop > 400 ? (zh ? "，不建议测加速" : "; not for acceleration") : ""}` : "—"],
  ];
  return <div className="gps-status">{rows.map(([label,value]) => <div className="gps-status-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
