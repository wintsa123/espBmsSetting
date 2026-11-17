import { useEffect, useState } from "react";
import "./DeviceControls.css";
import DashboardSheet from "./DashboardSheet";
import { dashboardIcon } from "./vendor/dashboard-parts";
import previewGroups from "./preview-controls.json";
import previewSettings from "./preview-settings.json";
import BrowserBluetooth from "./BrowserBluetooth";
import GpsStatus from "./GpsStatus";
import DeviceConnectionForm from "./DeviceConnectionForm";

const preview = import.meta.env.MODE === "preview";
type Option = { value: string; label: { zh: string; en: string } };
export type Control = { id: string; zh: string; en: string; value?: number; min?: number; max?: number; step?: number; confirm?: boolean; configKey?: string; options?: Option[]; binding?: "bms" | "controller"; secret?: boolean };
type Group = { id: string; zh: string; en: string; controls: Control[] };
type Setting = { id: string; kind: string; label: { zh: string; en: string }; value?: string | number | null; min?: number; max?: number; step?: number; options?: Option[] };
const configGroups: Record<string, string> = { brightness: "system", volume: "system", display_rotation: "system", speed_unit: "dashboard", speed_source: "dashboard", bms_type: "bms", controller_type: "controller", ant_channel: "bms", bluebabe_code: "bms" };

const styleChoices: Record<string, { value: number; zh: string; en: string; image: string }[]> = {
  dashboard_style: [
    { value: 0, zh: "宝马 S1000RR", en: "BMW S1000RR", image: "bmw-dashboard" },
    { value: 1, zh: "控制器监控", en: "Controller monitor", image: "controller-dashboard" },
    { value: 2, zh: "本田火刃", en: "Honda Fireblade", image: "honda-dashboard" },
  ],
  boot_style: [
    { value: 0, zh: "充电动画", en: "Charging", image: "charge-boot" },
    { value: 1, zh: "宝马开机", en: "BMW startup", image: "bmw-boot" },
    { value: 2, zh: "本田开机", en: "Honda startup", image: "honda-boot" },
  ],
};

function controlTitle(control: Control, language: "zh" | "en") {
  if (control.id === "dashboard_style") return language === "zh" ? "仪表样式" : "Dashboard style";
  if (control.id === "boot_style") return language === "zh" ? "开机动画" : "Boot animation";
  return control[language];
}

function settingsControls(items: Setting[]): Control[] {
  return items.filter(item => configGroups[item.id] && (item.kind === "range" || item.kind === "select")).filter(item => item.kind === "select"
    ? Array.isArray(item.options) && item.options.length > 0 && item.options.every(option => typeof option.value === "string" && typeof option.label?.zh === "string" && typeof option.label?.en === "string") && item.options.some(option => option.value === String(item.value))
    : [item.value, item.min, item.max, item.step].every(Number.isInteger) && item.min! <= Number(item.value) && Number(item.value) <= item.max! && item.step! > 0).map(item => ({
    id: item.id, zh: item.label.zh, en: item.label.en, configKey: item.id, options: item.options,
    value: item.options ? item.options.findIndex(option => option.value === String(item.value)) : Number(item.value),
    min: item.options ? 0 : item.min, max: item.options ? item.options.length - 1 : item.max, step: item.step || 1,
  }));
}
function groupControls(controls: Control[]): Group[] {
  return previewGroups.map(group => ({ ...group, controls: controls.filter(control => control.configKey ? configGroups[control.configKey] === group.id : control.binding ? control.binding === group.id : group.controls.some(item => item.id === control.id)).sort((a, b) => {
    const order = group.id === "controller" ? ["controller_type", "controller_mac"] : group.id === "bms" ? ["bms_type", "bms_mac"] : [];
    const rank = (control: Control) => { const index = order.indexOf(control.id); return index < 0 ? order.length : index; };
    return Number(!!a.confirm) - Number(!!b.confirm) || rank(a) - rank(b);
  }) }));
}
function bmsControls(config: Record<string, unknown>): Control[] {
  return [
    ...(config.bms_type === "ant" ? [{ id: "ant_channel", configKey: "ant_channel", zh: "蚂蚁通信通道", en: "ANT channel", value: Number(config.ant_channel || 0), min: 0, max: 2, step: 1, options: [{value:"0",label:{zh:"默认 FFE1",en:"Default FFE1"}},{value:"1",label:{zh:"通道 A（蓝牙屏接口）",en:"Channel A (display)"}},{value:"2",label:{zh:"通道 B（充电器接口）",en:"Channel B (charger)"}}] }] : []),
    ...(config.bms_type === "bluebabe" ? [{ id: "bluebabe_code", configKey: "bluebabe_code", zh: "蓝宝配对码", en: "Bluebabe pairing code", secret: true }] : []),
  ];
}
const previewControls = preview ? groupControls([...previewGroups.flatMap(group => group.controls), ...settingsControls(previewSettings), ...bmsControls({bms_type:"ant"}),
  ...(["bms", "controller"] as const).map(binding => ({ id: `${binding}_mac`, zh: "蓝牙连接", en: "Bluetooth connection", binding })),
]) : [];

export function DeviceControls({ language, connected, request, onBusy, onCatalog, focusId, onNotify, http, status, connectionTarget, onConnectionClose, onConnectionSaved }: {
  language: "zh" | "en"; connected: boolean; onBusy: (busy: boolean) => void;
  request: (path: string, options?: RequestInit) => Promise<unknown>;
  onCatalog?: (controls: Control[]) => void; focusId?: string; onNotify: (message: string) => void;
  http: boolean; status: Record<string, unknown>;
  connectionTarget?: "bms" | "controller" | null; onConnectionClose?: () => void; onConnectionSaved?: () => Promise<void>;
}) {
  const zh = language === "zh";
  const [groups, setGroups] = useState<Group[]>(preview ? previewControls : []);
  const [selected, setSelected] = useState<Control>();
  const [confirmation, setConfirmation] = useState<Control>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>(preview ? {bms_type:"ant"} : {});
  const [bindingSource, setBindingSource] = useState<"esp" | "computer">(!window.BmsNative ? "computer" : "esp");
  const [bindingMac, setBindingMac] = useState("");
  const [candidates, setCandidates] = useState<{ mac: string; name?: string; rssi?: number }[]>([]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => { onCatalog?.(groups.flatMap(group => group.controls.map(control => ({ ...control, zh: controlTitle(control, "zh"), en: controlTitle(control, "en") })))); }, [groups, onCatalog]);
  useEffect(() => {
    if (!focusId) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`control-${focusId}`);
      target?.closest("details")?.setAttribute("open", ""); target?.scrollIntoView({ block: "center", behavior: "smooth" }); target?.focus({ preventScroll: true });
      const control = groups.flatMap(group => group.controls).find(item => item.id === focusId);
      if (control && (control.value !== undefined || control.binding || control.secret)) openEditor(control);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [focusId, groups]);
  useEffect(() => { if (!connected && !preview) { setGroups([]); setSelected(undefined); setConfirmation(undefined); setConfig({}); } }, [connected]);
  useEffect(() => { if (connected && !preview) void load(); }, [connected]);

  function openEditor(control: Control) {
    setValues(current => ({ ...current, [control.id]: String(control.value ?? "") }));
    setBindingMac(String(config[control.id] || "")); setCandidates([]); setBindingSource(!window.BmsNative ? "computer" : "esp"); setSelected(control);
  }
  async function perform(task: () => Promise<void>) {
    setBusy(true);
    try { await task(); } catch (error) { onNotify(String(error)); } finally { setBusy(false); }
  }
  async function load() {
    if (preview) { onNotify(zh ? "测试预览：设置项已全部开启" : "Preview: all settings enabled"); return; }
    await perform(async () => {
      const deviceConfig = await request("/api/config") as Record<string, unknown>;
      const manifest = await request("/api/settings/manifest") as { protocol_version: number; sections: { items: Setting[] }[] };
      if (manifest.protocol_version !== 1 || !Array.isArray(manifest.sections) || !manifest.sections.every(section => Array.isArray(section.items))) throw new Error(zh ? "设备设置清单无效" : "Invalid settings manifest");
      const controls: Control[] = [];
      for (const id of ["display", "vehicle", "connection", "system"]) {
        const result = await request(`/api/controls?group=${id}`) as { controls: Control[] };
        if (!Array.isArray(result.controls) || !result.controls.every(control => typeof control.id === "string" && typeof control.zh === "string" && typeof control.en === "string" && (control.value === undefined || ([control.value, control.min, control.max, control.step].every(Number.isInteger) && control.min! <= control.value && control.value <= control.max! && control.step! > 0)))) throw new Error("Invalid controls");
        controls.push(...result.controls);
      }
      controls.push(...settingsControls(manifest.sections.flatMap(section => section.items)), ...bmsControls(deviceConfig));
      for (const binding of ["bms", "controller"] as const) {
        if (manifest.sections.some(section => section.items.some(item => item.id === `${binding}_mac` && item.kind === "choice"))) controls.push({ id: `${binding}_mac`, zh: "蓝牙连接", en: "Bluetooth connection", binding });
      }
      setConfig(deviceConfig); setGroups(groupControls(controls));
    });
  }
  async function send(control: Control) {
    setConfirmation(undefined);
    await perform(async () => {
      const value = control.value === undefined ? undefined : Number(values[control.id]);
      if (control.secret && !/^[0-9]{6}$/.test(values[control.id] || "")) throw new Error(zh ? "请输入六位数字配对码" : "Enter six digits");
      if (value !== undefined && (!values[control.id]?.trim() || !Number.isInteger(value) || value < control.min! || value > control.max! || (value - control.min!) % (control.step || 1) !== 0)) throw new Error(zh ? "请填写范围内的有效数值" : "Enter a valid value in range");
      if (preview) { updateValue(control, value); onNotify(zh ? "模拟操作完成，未发送到设备" : "Simulated; nothing sent to device"); return; }
      if (!connected) throw new Error(zh ? "请先连接设备" : "Connect first");
      if (control.configKey) await request("/api/config", { method: "POST", body: JSON.stringify({ [control.configKey]: control.secret ? values[control.id] : control.configKey === "ant_channel" ? value : control.options ? control.options[value!].value : value }) });
      else await request("/api/controls", { method: "POST", body: JSON.stringify({ action: control.id, ...(value === undefined ? {} : { value }) }) });
      updateValue(control, value);
      onNotify(zh ? "指令已提交，请刷新读取设备当前值" : "Submitted; refresh for current device values");
    });
  }
  function updateValue(control: Control, value?: number) {
    if (control.configKey === "bms_type") {
      const type = control.options![value!].value;
      const nextConfig = { ...config, bms_type: type }; setConfig(nextConfig);
      setGroups(current => groupControls([...current.flatMap(group => group.controls).filter(item => item.id !== "ant_channel" && item.id !== "bluebabe_code").map(item => item.id === control.id ? {...item, value} : item), ...bmsControls(nextConfig)]));
    } else if (value !== undefined) setGroups(current => current.map(group => ({ ...group, controls: group.controls.map(item => item.id === control.id ? {...item, value} : item) })));
    if (control.secret) setValues(current => ({...current,[control.id]:""}));
  }
  const disabled = busy || (!connected && !preview);
  const info: Record<string, [string, unknown][]> = {
    hotspot: [[zh ? "名称" : "Name", config.setup_ap_ssid], [zh ? "状态" : "Status", config.setup_ap_state]],
    bluetooth: [[zh ? "名称" : "Name", "ESP32BMSGPS"]],
  };
  return <section className="stack device-controls" aria-label={zh ? "面板功能控制" : "Panel controls"}>
    <div className="card-head"><h2 className="card-title">{zh ? "设备设置" : "Device settings"}</h2></div>
    {preview && <p className="control-preview">{zh ? "测试预览" : "Preview"}</p>}
    {!connected && !preview && <p className="empty">{zh ? "连接设备后读取设置项" : "Connect and load device settings"}</p>}
    {groups.filter(group => preview || group.controls.length || (group.id === "gps" && status.gps_fix !== undefined)).map(group => <details className="card feature-group" key={group.id}>
      <summary className="feature-heading"><span className="feature-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dashboardIcon(({hotspot:"wifi", bluetooth:"bt", bms:"battery", gps:"route", dashboard:"speed", controller:"gauge", system:"gear"} as Record<string,string>)[group.id], 20) }} /><span>{group[language]}</span><span className="feature-chevron" aria-hidden="true">⌄</span></summary>
      <div className="feature-rows">
        {group.id === "gps" && <GpsStatus language={language} status={status} />}
        {info[group.id]?.map(([label, value]) => <div className="kv" key={label}><span className="k">{label}</span><span className="v">{String(value ?? "—")}</span></div>)}
        {group.controls.map(control => <button type="button" className="quiet feature-row" key={control.id} id={`control-${control.id}`} data-feature-focus={focusId === control.id} disabled={disabled || (!!control.binding && !http && !preview)} onClick={() => { if (control.value !== undefined || control.binding || control.secret) openEditor(control); else setConfirmation(control); }}>
          <span className={control.confirm ? "control-danger" : ""}>{controlTitle(control, language)}</span><span className="feature-value">{control.secret ? (zh ? "修改" : "Edit") : control.options ? control.options[control.value!]?.label[language] : control.binding ? (zh ? "扫描绑定" : "Scan & bind") : control.value === undefined ? (zh ? "执行" : "Run") : styleChoices[control.id]?.find(choice => choice.value === control.value)?.[language] ?? control.value}</span>{(control.value !== undefined || control.binding || control.secret) && <span aria-hidden="true">›</span>}
        </button>)}

      </div>
    </details>)}
    <DashboardSheet open={!!connectionTarget} title={connectionTarget === "bms" ? (zh ? "保护板连接设置" : "BMS connection settings") : (zh ? "控制器连接设置" : "Controller connection settings")} closeLabel={zh ? "取消" : "Cancel"} onClose={() => { if (!busy) onConnectionClose?.(); }}>
      {connectionTarget && <DeviceConnectionForm key={connectionTarget} target={connectionTarget} language={language} config={config} controls={groups.flatMap(group => group.controls)} connected={connected} http={http} busy={busy} request={request} perform={perform} onClose={() => onConnectionClose?.()} onNotify={onNotify} onSave={async (settings, mac) => {
        if (preview) {
          const control = groups.flatMap(group => group.controls).find(item => item.id === `${connectionTarget}_type`);
          if (control) updateValue(control, control.options!.findIndex(option => option.value === settings[control.id]));
          onNotify(zh ? "模拟操作完成，未发送到设备" : "Simulated; nothing sent to device");
        } else {
          if (!connected) throw new Error(zh ? "请先连接 ESP32 面板" : "Connect to ESP32 first");
          await request("/api/config", { method: "POST", body: JSON.stringify(settings) });
          if (mac) await request(`/api/${connectionTarget}/bind`, { method: "POST", body: JSON.stringify({ mac }) });
          const control = groups.flatMap(group => group.controls).find(item => item.id === `${connectionTarget}_type`);
          if (control) updateValue(control, control.options!.findIndex(option => option.value === settings[control.id]));
          setConfig(current => ({ ...current, ...Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "bluebabe_code")), ...(mac ? { [`${connectionTarget}_mac`]: mac } : {}) }));
          await onConnectionSaved?.();
          onNotify(mac ? (zh ? "绑定已提交，正在连接设备" : "Binding submitted; connecting") : (zh ? "连接设置已保存" : "Connection settings saved"));
        }
        onConnectionClose?.();
      }} />}
    </DashboardSheet>
    <DashboardSheet center={!!confirmation} open={!!selected || !!confirmation} title={selected ? controlTitle(selected, language) : confirmation ? controlTitle(confirmation, language) : ""} closeLabel={zh ? "取消" : "Cancel"} onClose={() => { setSelected(undefined); setConfirmation(undefined); setValues({}); }}>
      <div className="device-forms control-editor">
        {selected && !confirmation && !selected.binding && <form className="control-item" onSubmit={event => { event.preventDefault(); void send(selected); }}>
          {styleChoices[selected.id] ? <div className="control-style-options" role="radiogroup" aria-label={controlTitle(selected, language)}>{styleChoices[selected.id].filter(choice => choice.value >= selected.min! && choice.value <= selected.max!).map(choice => <button key={choice.value} type="button" className="quiet control-style-choice" role="radio" aria-label={choice[language]} aria-checked={Number(values[selected.id]) === choice.value} disabled={disabled} onClick={() => setValues(current => ({ ...current, [selected.id]: String(choice.value) }))}><img src={`${import.meta.env.BASE_URL}art/controls/${choice.image}.webp`} alt="" /><span>{choice[language]}</span><span className="control-style-check" aria-hidden="true">{Number(values[selected.id]) === choice.value ? "●" : "○"}</span></button>)}</div>
          : selected.secret ? <label>{controlTitle(selected,language)}<input type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={disabled} value={values[selected.id] || ""} onChange={event => setValues(current => ({...current,[selected.id]:event.target.value}))} /></label>
           : selected.options ? <div className="control-option-list" role="radiogroup" aria-label={controlTitle(selected,language)}>{selected.options.map((option,index) => <label className="control-option" key={option.value}><input type="radio" name={selected.id} value={index} checked={Number(values[selected.id]) === index} disabled={disabled} onChange={() => setValues(current => ({...current,[selected.id]:String(index)}))} /><span>{option.label[language]}</span></label>)}</div>
          : <label>{controlTitle(selected, language)}<input type="number" inputMode="numeric" required min={selected.min} max={selected.max} step={selected.step || 1} disabled={disabled} value={values[selected.id] || ""} onChange={event => setValues(current => ({...current,[selected.id]:event.target.value}))} /><small>{selected.min} – {selected.max}</small></label>}
          <button className="btn tonal" disabled={disabled}>{zh ? "应用" : "Apply"}</button>
        </form>}
        {selected?.binding && !confirmation && <div className="control-item">
          {!window.BmsNative && <div className="control-source" role="group" aria-label={zh ? "蓝牙连接方式" : "Bluetooth source"}><button type="button" className="quiet" aria-pressed={bindingSource === "computer"} onClick={() => setBindingSource("computer")}>{zh ? "本机蓝牙" : "This computer"}</button><button type="button" className="quiet" aria-pressed={bindingSource === "esp"} onClick={() => setBindingSource("esp")}>{zh ? "ESP 扫描绑定" : "ESP scan & bind"}</button></div>}
          {bindingSource === "computer" && !window.BmsNative ? <BrowserBluetooth key={selected.binding} language={language} onNotify={onNotify} /> : <>
            <div className="button-row"><button className="btn tonal" disabled={disabled || !connected || !http} onClick={() => void perform(async () => { await request(`/api/${selected.binding}/scan`,{method:"POST"}); setCandidates([]); onNotify(zh ? "扫描已提交，请稍后刷新列表" : "Scan started; refresh shortly"); })}>{zh ? "扫描设备" : "Scan devices"}</button><button className="btn tonal" disabled={disabled || !connected || !http} onClick={() => void perform(async () => { const result=await request(`/api/${selected.binding}/candidates`) as {candidates?: typeof candidates}; if (!Array.isArray(result.candidates)) throw new Error("Invalid candidates"); setCandidates(result.candidates.filter(item => typeof item.mac === "string" && /^([\da-f]{2}:){5}[\da-f]{2}$/i.test(item.mac))); onNotify(zh ? "列表已刷新" : "List refreshed"); })}>{zh ? "刷新列表" : "Refresh list"}</button></div>
            {!connected || !http ? <p className="empty">{zh ? "连接 ESP 设备热点后扫描绑定" : "Connect to the ESP hotspot to scan and bind"}</p> : !candidates.length && <p className="empty">{zh ? "暂无设备，扫描完成后刷新列表" : "No devices yet. Refresh after scanning."}</p>}
            {candidates.map(candidate => <button type="button" className="candidate" key={candidate.mac} onClick={() => setBindingMac(candidate.mac)} aria-pressed={bindingMac === candidate.mac}><span>{candidate.name || candidate.mac}<small>{candidate.mac}</small></span><small>{candidate.rssi} dBm</small></button>)}
            <button className="btn" disabled={disabled || !connected || !http || !bindingMac} onClick={() => setConfirmation(selected)}>{zh ? "绑定所选设备" : "Bind selected device"}</button>
          </>}
        </div>}
        {selected && !confirmation && <button className="btn text" type="button" onClick={() => { setSelected(undefined); setValues({}); }}>{zh ? "取消" : "Cancel"}</button>}
        {confirmation && <div role="alert"><p>{zh ? `确认执行“${controlTitle(confirmation, language)}”？` : `Confirm “${controlTitle(confirmation,language)}”?`}</p><div className="button-row"><button className="btn text" type="button" onClick={() => { setSelected(undefined); setConfirmation(undefined); setValues({}); }}>{zh ? "取消" : "Cancel"}</button><button className="btn" disabled={disabled} onClick={() => { if (confirmation.binding) { const binding=confirmation.binding; setConfirmation(undefined); void perform(async () => { if (!preview) await request(`/api/${binding}/bind`,{method:"POST",body:JSON.stringify({mac:bindingMac})}); onNotify(zh ? "绑定已提交" : "Binding submitted"); }); } else void send(confirmation); }}>{zh ? "确认执行" : "Confirm"}</button></div></div>}
      </div>
    </DashboardSheet>
  </section>;
}
