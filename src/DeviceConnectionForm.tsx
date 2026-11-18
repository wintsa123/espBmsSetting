import Dropdown from "./Dropdown";
import { useEffect, useState } from "react";
import type { Control } from "./DeviceControls";
import BrowserBluetooth from "./BrowserBluetooth";
import { dashboardIcon } from "./vendor/dashboard-parts";
import "./DeviceConnectionForm.css";

type Candidate = { mac: string; name?: string; rssi?: number };
const macPattern = /^([\da-f]{2}:){5}[\da-f]{2}$/i;

export default function DeviceConnectionForm({ target, language, config, controls, connected, http, busy, request, perform, onSave, onClose, onNotify }: {
  target: "bms" | "controller"; language: "zh" | "en"; config: Record<string, unknown>; controls: Control[];
  connected: boolean; http: boolean; busy: boolean;
  request: (path: string, options?: RequestInit) => Promise<unknown>;
  perform: (task: () => Promise<void>) => Promise<void>;
  onSave: (settings: Record<string, unknown>, mac: string) => Promise<void>; onClose: () => void; onNotify: (message: string) => void;
}) {
  const zh = language === "zh", typeKey = `${target}_type`, macKey = `${target}_mac`;
  const typeControl = controls.find(control => control.id === typeKey);
  const [type, setType] = useState(""), [mac, setMac] = useState(""), [channel, setChannel] = useState("0"), [code, setCode] = useState("");
  const [source, setSource] = useState<"esp" | "computer">("esp");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  useEffect(() => {
    setType(String(config[typeKey] || typeControl?.options?.[typeControl.value || 0]?.value || ""));
    setMac(String(config[macKey] || "")); setChannel(String(config.ant_channel || 0)); setCode(""); setCandidates([]);
  }, [config, typeControl]);
  const canWrite = (connected || import.meta.env.MODE === "preview") && !busy && !!typeControl, canScan = connected && http && !busy;
  const scan = (start: boolean) => void perform(async () => {
    if (start) { await request(`/api/${target}/scan`, { method: "POST" }); setCandidates([]); onNotify(zh ? "扫描已开始，稍后查看扫描结果" : "Scan started; check results shortly"); return; }
    const result = await request(`/api/${target}/candidates`) as { candidates?: Candidate[] };
    if (!Array.isArray(result.candidates)) throw new Error(zh ? "设备列表格式无效" : "Invalid device list");
    setCandidates(result.candidates.filter(item => typeof item?.mac === "string" && macPattern.test(item.mac)));
  });
  const submit = () => void perform(async () => {
    if (!typeControl?.options?.some(option => option.value === type)) throw new Error(zh ? "请选择设备类型" : "Select a device type");
    const address = source === "esp" && http ? mac.trim() : "";
    if (address && !macPattern.test(address)) throw new Error(zh ? "请输入有效的蓝牙 MAC 地址" : "Enter a valid Bluetooth MAC address");
    if (type === "bluebabe" && code && !/^[0-9]{6}$/.test(code)) throw new Error(zh ? "配对码必须为六位数字" : "Pairing code must contain six digits");
    const settings: Record<string, unknown> = { [typeKey]: type };
    if (target === "bms" && type === "ant") settings.ant_channel = Number(channel);
    if (target === "bms" && type === "bluebabe" && code) settings.bluebabe_code = code;
    await onSave(settings, address);
  });
  return <div className="device-connection device-forms">
    <div className="connection-intro"><span className="connection-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dashboardIcon(target === "bms" ? "battery" : "gauge", 26) }} /><div><strong>{zh ? "连接你的" + (target === "bms" ? "保护板" : "控制器") : `Connect your ${target === "bms" ? "BMS" : "controller"}`}</strong><p>{zh ? "选择类型，配对蓝牙设备" : "Choose a type and pair a Bluetooth device"}</p></div></div>
    <form className="connection-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="connection-field"><span>{zh ? "设备类型" : "Device type"}</span><Dropdown label={zh ? "设备类型" : "Device type"} value={type} disabled={busy || !typeControl} options={typeControl?.options?.map(option => ({ value: option.value, label: option.label[language] })) ?? [{ value: "", label: zh ? "连接面板后读取" : "Connect to load types" }]} onChange={value => { setType(value); setCode(""); setMac(""); setCandidates([]); }} /></div>
      {target === "bms" && type === "ant" && <div className="connection-field"><span>{zh ? "通信通道" : "Communication channel"}</span><Dropdown label={zh ? "通信通道" : "Communication channel"} value={channel} disabled={busy} onChange={setChannel} options={(zh ? ["默认 FFE1", "通道 A · 蓝牙屏接口", "通道 B · 充电器接口"] : ["Default FFE1", "Channel A · Display", "Channel B · Charger"]).map((label, index) => ({ value: String(index), label }))} /></div>}
      {target === "bms" && type === "bluebabe" && <label className="connection-field"><span>{zh ? "蓝宝配对码" : "Bluebabe pairing code"}</span><input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder={config.bluebabe_code_saved ? (zh ? "已保存，留空保留" : "Saved; leave blank to keep") : (zh ? "六位数字" : "Six digits")} value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label>}
      {!window.BmsNative && <div className="control-source" role="group" aria-label={zh ? "蓝牙连接方式" : "Bluetooth source"}><button type="button" className="quiet" aria-pressed={source === "esp"} disabled={busy} onClick={() => setSource("esp")}>{zh ? "面板蓝牙" : "Panel Bluetooth"}</button><button type="button" className="quiet" aria-pressed={source === "computer"} disabled={busy} onClick={() => setSource("computer")}>{zh ? "本机蓝牙" : "Local Bluetooth"}</button></div>}
      {source === "computer" && !window.BmsNative ? <BrowserBluetooth language={language} onNotify={onNotify} /> : <div className="connection-bluetooth">
        <div className="connection-section-title"><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: dashboardIcon("bt", 18) }} /><strong>{zh ? "蓝牙设备" : "Bluetooth device"}</strong></div>
        <div className="connection-scan-actions"><button type="button" className="btn tonal" disabled={!canScan} onClick={() => scan(true)}>{zh ? "扫描附近设备" : "Scan nearby"}</button><button type="button" className="btn text" disabled={!canScan} onClick={() => scan(false)}>{zh ? "查看扫描结果" : "Scan results"}</button></div>
        <div className="connection-candidates">{candidates.length ? candidates.map(candidate => <button type="button" className="quiet connection-candidate" key={candidate.mac} aria-pressed={mac.toLowerCase() === candidate.mac.toLowerCase()} disabled={busy} onClick={() => setMac(candidate.mac)}><span><strong>{candidate.name || (zh ? "蓝牙设备" : "Bluetooth device")}</strong><small>{candidate.mac}</small></span><span>{candidate.rssi == null ? "" : `${candidate.rssi} dBm`}<b aria-hidden="true">{mac.toLowerCase() === candidate.mac.toLowerCase() ? "✓" : "+"}</b></span></button>) : <p className="connection-empty">{!connected ? (zh ? "连接 ESP32 面板后，可扫描并保存设置" : "Connect to ESP32 to scan and save settings") : !http ? (zh ? "连接面板 Wi-Fi 后可扫描并绑定蓝牙设备" : "Connect via panel Wi-Fi to scan and bind") : (zh ? "扫描附近设备，或直接填写蓝牙地址" : "Scan nearby devices or enter a Bluetooth address")}</p>}</div>
        <label className="connection-field"><span>{zh ? "蓝牙地址" : "Bluetooth address"}</span><input value={mac} disabled={busy || !http} placeholder="AA:BB:CC:DD:EE:FF" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={17} onChange={event => setMac(event.target.value)} /></label>
      </div>}
      <div className="connection-actions"><button type="button" className="btn text" disabled={busy} onClick={onClose}>{zh ? "取消" : "Cancel"}</button><button className="btn" disabled={!canWrite}>{busy ? (zh ? "正在保存…" : "Saving…") : source === "computer" || !http || !mac.trim() ? (zh ? "保存设置" : "Save settings") : (zh ? "保存并连接" : "Save & connect")}</button></div>
    </form>
  </div>;
}
