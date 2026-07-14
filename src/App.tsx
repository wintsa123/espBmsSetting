import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const CONTROL_SERVICE_UUID = "7b47f060-0f68-4ad2-9a25-7f3d36a6c7a1";
const CONTROL_TX_UUID = "7b47f061-0f68-4ad2-9a25-7f3d36a6c7a1";
const CONTROL_RX_UUID = "7b47f062-0f68-4ad2-9a25-7f3d36a6c7a1";

type Language = "zh" | "en";
type Transport = "http" | "ble";
type Tab = "overview" | "network" | "device" | "update";
type JsonRecord = Record<string, unknown>;

type Status = {
  version?: string;
  speed?: string;
  speed_unit?: string;
  bms?: string;
  wifi?: string;
  ota?: string;
  local_battery_mv?: number | null;
  pack_voltage_mv?: number | null;
};

type Config = {
  brightness?: number;
  volume?: number;
  display_rotation?: string;
  speed_unit?: string;
  language?: Language;
  bms_mac?: string | null;
  bms_type?: "ant" | "jk" | "jbd" | "daly";
};

type BmsCandidate = {
  mac?: string;
  name?: string | null;
  rssi?: number;
};

type BleState = {
  tx?: BluetoothRemoteGATTCharacteristic;
  rx?: BluetoothRemoteGATTCharacteristic;
  deviceName?: string;
};

type PendingBle = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
};

const I18N = {
  zh: {
    apPassword: "设置热点密码",
    battery: "电池",
    bindBms: "绑定 BMS",
    bleControlUnavailable: "固件未开启蓝牙控制服务",
    bluetoothUnsupported: "当前浏览器不支持 Web Bluetooth",
    bms: "BMS",
    bmsType: "保护板类型",
    brightness: "亮度",
    volume: "音量",
    checkUpdate: "检查更新",
    connectBle: "蓝牙",
    connectHttp: "热点 API",
    connected: "已连接",
    connecting: "连接中",
    device: "设备",
    deviceAddress: "设备地址",
    disabled: "关闭",
    disconnected: "已断开",
    downloading: "下载中",
    failed: "失败",
    firmware: "固件",
    httpConnected: "热点 API 已连接",
    idle: "空闲",
    language: "语言",
    network: "网络",
    noCandidates: "暂无候选设备",
    offline: "离线",
    online: "在线",
    overview: "概览",
    refresh: "刷新",
    readyToReboot: "待重启",
    saved: "已保存",
    saveDevice: "保存设备",
    scanBms: "扫描 BMS",
    screenRotation: "屏幕方向",
    setupAp: "设置热点",
    speed: "速度",
    speedUnit: "速度单位",
    startUpdate: "开始更新",
    update: "更新",
    updateAvailable: "有更新",
    verifying: "校验中",
    wifi: "Wi-Fi",
  },
  en: {
    apPassword: "Setup AP password",
    battery: "Battery",
    bindBms: "Bind BMS",
    bleControlUnavailable: "Firmware BLE control service is not enabled",
    bluetoothUnsupported: "Web Bluetooth is not supported",
    bms: "BMS",
    bmsType: "BMS type",
    brightness: "Brightness",
    volume: "Volume",
    checkUpdate: "Check update",
    connectBle: "Bluetooth",
    connectHttp: "Hotspot API",
    connected: "connected",
    connecting: "connecting",
    device: "Device",
    deviceAddress: "Device address",
    disabled: "disabled",
    disconnected: "disconnected",
    downloading: "downloading",
    failed: "failed",
    firmware: "Firmware",
    httpConnected: "Hotspot API connected",
    idle: "idle",
    language: "Language",
    network: "Network",
    noCandidates: "No candidates",
    offline: "offline",
    online: "online",
    overview: "Overview",
    refresh: "Refresh",
    readyToReboot: "ready to reboot",
    saved: "Saved",
    saveDevice: "Save device",
    scanBms: "Scan BMS",
    screenRotation: "Screen rotation",
    setupAp: "Setup AP",
    speed: "Speed",
    speedUnit: "Speed unit",
    startUpdate: "Start update",
    update: "Update",
    updateAvailable: "update available",
    verifying: "verifying",
    wifi: "Wi-Fi",
  },
} satisfies Record<Language, Record<string, string>>;

const STATE_LABELS: Record<string, keyof typeof I18N.zh> = {
  connected: "connected",
  connecting: "connecting",
  disabled: "disabled",
  downloading: "downloading",
  failed: "failed",
  idle: "idle",
  offline: "offline",
  online: "online",
  ready_to_reboot: "readyToReboot",
  setup_ap: "setupAp",
  setup_ap_only: "setupAp",
  station_connected: "connected",
  station_connecting: "connecting",
  update_available: "updateAvailable",
  verifying: "verifying",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function CastLanding() {
  const deepLink = `fuckingbms://cast/v1${window.location.search}`;
  const [english, setEnglish] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { window.location.href = deepLink; }, 150);
    return () => window.clearTimeout(timer);
  }, [deepLink]);

  return (
    <main className="cast-landing">
      <button className="cast-language" onClick={() => setEnglish(!english)}>{english ? "中文" : "English"}</button>
      <p className="eyebrow">{english ? "BMS REMOTE CAST" : "BMS 远程投屏"}</p>
      <h1>{english ? "Opening the casting app…" : "正在打开投屏 App…"}</h1>
      <p>{english ? "The BMS casting app opens automatically when installed. Make sure the phone is connected to the device hotspot." : "已安装 BMS 投屏 App 时将自动打开。请确认手机已连接设备热点。"}</p>
      <a className="cast-open" href={deepLink}>{english ? "Open BMS Casting App" : "打开 BMS 投屏 App"}</a>
      <p className="cast-help">{english ? "If the app is not installed, install the APK and scan again." : "若未安装 App，请安装 APK 后重新扫码。"}</p>
    </main>
  );
}

export default function App() {
  if (window.location.pathname === "/cast") return <CastLanding />;
  const [language, setLanguage] = useState<Language>("zh");
  const [transport, setTransport] = useState<Transport>("http");
  const [tab, setTab] = useState<Tab>("overview");
  const [baseUrl, setBaseUrl] = useState("http://192.168.4.1");
  const [status, setStatus] = useState<Status>({});
  const [config, setConfig] = useState<Config>({
    language: "zh",
    display_rotation: "landscape",
    speed_unit: "km/h",
    bms_type: "ant",
  });
  const [candidates, setCandidates] = useState<BmsCandidate[]>([]);
  const [message, setMessage] = useState("未连接");
  const [busy, setBusy] = useState(false);
  const [ble, setBle] = useState<BleState>({});
  const transportRef = useRef<Transport>("http");
  const bleRef = useRef<BleState>({});
  const pendingBle = useRef(new Map<string, PendingBle>());
  const bleBuffer = useRef("");

  const t = useMemo(() => {
    return (key: keyof typeof I18N.zh) => I18N[language][key] || I18N.zh[key] || key;
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  function setCurrentTransport(next: Transport) {
    transportRef.current = next;
    setTransport(next);
  }

  function setCurrentBle(next: BleState) {
    bleRef.current = next;
    setBle(next);
  }

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      setMessage(label);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function api(path: string, options: RequestInit = {}): Promise<unknown> {
    const currentBle = bleRef.current;
    if (transportRef.current === "ble" && currentBle.tx && currentBle.rx) {
      return bleApi(path, options);
    }
    return httpApi(path, options);
  }

  async function httpApi(path: string, options: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");

    const response = await fetchLocalDevice(normalizeBaseUrl(baseUrl) + path, {
      ...options,
      headers,
      mode: "cors",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
  }

  async function fetchLocalDevice(url: string, options: RequestInit) {
    const attempts = [{ targetAddressSpace: "local" }, { targetAddressSpace: "private" }, {}] as RequestInit[];
    let lastError: unknown;
    for (const extra of attempts) {
      try {
        return await fetch(url, { ...options, ...extra });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function bleApi(path: string, options: RequestInit = {}) {
    const currentBle = bleRef.current;
    if (!currentBle.tx) throw new Error("BLE not connected");
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const request = {
      id,
      method: options.method || "GET",
      path,
      body: options.body ? String(options.body) : "",
    };
    const promise = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingBle.current.delete(id);
        reject(new Error("蓝牙请求超时"));
      }, 8000);
      pendingBle.current.set(id, { resolve, reject, timer });
    });
    try {
      await writeBleText(currentBle.tx, JSON.stringify(request) + "\n");
    } catch (error) {
      const pending = pendingBle.current.get(id);
      if (pending) {
        window.clearTimeout(pending.timer);
        pendingBle.current.delete(id);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return promise;
  }

  async function writeBleText(tx: BluetoothRemoteGATTCharacteristic, text: string) {
    const bytes = encoder.encode(text);
    for (let offset = 0; offset < bytes.length; offset += 180) {
      const chunk = bytes.slice(offset, offset + 180);
      if (tx.writeValueWithoutResponse) {
        await tx.writeValueWithoutResponse(chunk);
      } else if (tx.writeValue) {
        await tx.writeValue(chunk);
      } else {
        throw new Error("BLE write is not supported");
      }
    }
  }

  function onBleValue(event: Event) {
    const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;
    bleBuffer.current += decoder.decode(target.value);
    let newline = bleBuffer.current.indexOf("\n");
    while (newline >= 0) {
      const line = bleBuffer.current.slice(0, newline).trim();
      bleBuffer.current = bleBuffer.current.slice(newline + 1);
      if (line) resolveBleLine(line);
      newline = bleBuffer.current.indexOf("\n");
    }
  }

  function resolveBleLine(line: string) {
    const message = JSON.parse(line) as { id?: string; status?: number; error?: string; body?: string };
    if (!message.id) return;
    const pending = pendingBle.current.get(message.id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingBle.current.delete(message.id);
    if ((message.status || 200) >= 400) {
      pending.reject(new Error(message.error || `BLE ${message.status}`));
      return;
    }
    pending.resolve(parseMaybeJson(message.body || ""));
  }

  async function connectHttp() {
    await run(t("httpConnected"), async () => {
      setCurrentTransport("http");
      await loadConfig();
      await refresh();
    });
  }

  async function connectBle() {
    await run("BLE", async () => {
      if (!navigator.bluetooth) throw new Error(t("bluetoothUnsupported"));
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [CONTROL_SERVICE_UUID],
      });
      const server = await device.gatt?.connect();
      if (!server) throw new Error(t("disconnected"));
      let tx: BluetoothRemoteGATTCharacteristic;
      let rx: BluetoothRemoteGATTCharacteristic;
      try {
        const service = await server.getPrimaryService(CONTROL_SERVICE_UUID);
        tx = await service.getCharacteristic(CONTROL_TX_UUID);
        rx = await service.getCharacteristic(CONTROL_RX_UUID);
      } catch {
        throw new Error(t("bleControlUnavailable"));
      }
      await rx.startNotifications();
      rx.addEventListener("characteristicvaluechanged", onBleValue);
      device.addEventListener("gattserverdisconnected", () => {
        setCurrentBle({});
        setCurrentTransport("http");
        setMessage(t("disconnected"));
      });
      setCurrentBle({ tx, rx, deviceName: device.name || device.id });
      setCurrentTransport("ble");
      await loadConfig();
      await refresh();
    });
  }

  async function refresh() {
    const data = (await api("/api/status")) as Status;
    setStatus(data);
  }

  async function loadConfig() {
    const data = (await api("/api/config")) as Config;
    setConfig({
      brightness: data.brightness ?? 80,
      volume: data.volume ?? 60,
      display_rotation: data.display_rotation ?? "landscape",
      speed_unit: data.speed_unit ?? "km/h",
      language: data.language ?? "zh",
      bms_mac: data.bms_mac ?? "",
      bms_type: data.bms_type ?? "ant",
    });
    setLanguage(data.language === "en" ? "en" : "zh");
  }

  async function loadBmsCandidates() {
    const data = (await api("/api/bms/candidates")) as { candidates?: BmsCandidate[] };
    setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
  }

  async function post(path: string, body?: JsonRecord) {
    await api(path, { method: "POST", body: body ? JSON.stringify(body) : "" });
  }

  const submitApPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget)) as { password?: string };
    void run(t("saved"), async () => {
      await post("/api/ap-password", body);
    });
  };

  const submitDevice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget)) as JsonRecord;
    void run(t("saved"), async () => {
      await post("/api/config", body);
      await loadConfig();
      await refresh();
    });
  };

  const battery = formatMillivolts(status.local_battery_mv ?? status.pack_voltage_mv);
  const connection = transport === "ble" ? `BLE ${ble.deviceName || ""}`.trim() : normalizeBaseUrl(baseUrl);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{connection}</p>
          <h1>ESP32 BMS GPS</h1>
        </div>
        <button className="icon-button" type="button" disabled={busy} onClick={() => void run(t("refresh"), refresh)}>
          ↻
        </button>
      </header>

      <section className="hero">
        <div>
          <span>{t("firmware")}</span>
          <strong>{status.version || "--"}</strong>
        </div>
        <div>
          <span>{t("wifi")}</span>
          <strong>{formatState(status.wifi, t)}</strong>
        </div>
      </section>

      <section className="quick-actions">
        <button type="button" disabled={busy} onClick={() => void connectHttp()}>
          {t("connectHttp")}
        </button>
        <button className="secondary" type="button" disabled={busy} onClick={() => void connectBle()}>
          {t("connectBle")}
        </button>
      </section>

      <section className={tab === "overview" ? "panel active" : "panel"}>
        <Metric label={t("speed")} value={`${status.speed || "--"} ${status.speed_unit || ""}`.trim()} />
        <Metric label={t("battery")} value={battery} />
        <Metric label={t("bms")} value={formatState(status.bms, t)} />
        <Metric label="OTA" value={formatState(status.ota, t)} />
      </section>

      <section className={tab === "network" ? "panel active" : "panel"}>
        <div className="stack">
          <label>
            <span>{t("deviceAddress")}</span>
            <input value={baseUrl} inputMode="url" onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => void connectHttp()}>
              {t("connectHttp")}
            </button>
            <button className="secondary" type="button" disabled={busy} onClick={() => void connectBle()}>
              {t("connectBle")}
            </button>
          </div>
        </div>

        <form className="stack" onSubmit={submitApPassword}>
          <label>
            <span>{t("apPassword")}</span>
            <input name="password" type="password" minLength={8} maxLength={64} autoComplete="new-password" />
          </label>
          <button type="submit" disabled={busy}>
            {t("setupAp")}
          </button>
        </form>
      </section>

      <section className={tab === "device" ? "panel active" : "panel"}>
        <form className="stack" onSubmit={submitDevice}>
          <label>
            <span>{t("brightness")}: {config.brightness ?? 80}%</span>
            <input
              name="brightness"
              type="range"
              min={10}
              max={100}
              value={config.brightness ?? 80}
              onChange={(event) => setConfig({ ...config, brightness: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>{t("volume")}: {config.volume ?? 60}%</span>
            <input
              name="volume"
              type="range"
              min={0}
              max={100}
              value={config.volume ?? 60}
              onChange={(event) => setConfig({ ...config, volume: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>{t("screenRotation")}</span>
            <select name="display_rotation" value={config.display_rotation || "landscape"} onChange={(event) => setConfig({ ...config, display_rotation: event.target.value })}>
              <option value="portrait">竖屏</option>
              <option value="landscape">横屏</option>
              <option value="inverted_portrait">反向竖屏</option>
              <option value="inverted_landscape">反向横屏</option>
            </select>
          </label>
          <label>
            <span>{t("speedUnit")}</span>
            <select name="speed_unit" value={config.speed_unit || "km/h"} onChange={(event) => setConfig({ ...config, speed_unit: event.target.value })}>
              <option>km/h</option>
              <option>mph</option>
            </select>
          </label>
          <label>
            <span>{t("language")}</span>
            <select
              name="language"
              value={language}
              onChange={(event) => {
                const value = event.target.value === "en" ? "en" : "zh";
                setLanguage(value);
                setConfig({ ...config, language: value });
              }}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            <span>BMS MAC</span>
            <input name="bms_mac" value={config.bms_mac || ""} placeholder="AA:BB:CC:DD:EE:FF" onChange={(event) => setConfig({ ...config, bms_mac: event.target.value })} />
          </label>
          <label>
            <span>{t("bmsType")}</span>
            <select name="bms_type" value={config.bms_type || "ant"} onChange={(event) => setConfig({ ...config, bms_type: event.target.value as Config["bms_type"] })}>
              <option value="ant">蚂蚁 ANT</option>
              <option value="jk">极空 JK</option>
              <option value="jbd">嘉佰达 JBD</option>
              <option value="daly">达锂 Daly</option>
            </select>
          </label>
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => void run(t("scanBms"), async () => { await post("/api/bms/scan"); await loadBmsCandidates(); })}>
              {t("scanBms")}
            </button>
            <button className="secondary" type="button" disabled={busy || !config.bms_mac} onClick={() => void run(t("bindBms"), async () => { await post("/api/bms/bind", { mac: config.bms_mac || "" }); await loadBmsCandidates(); })}>
              {t("bindBms")}
            </button>
          </div>
          <CandidateList candidates={candidates} emptyLabel={t("noCandidates")} onPick={(mac) => setConfig({ ...config, bms_mac: mac })} />
          <button type="submit" disabled={busy}>
            {t("saveDevice")}
          </button>
        </form>
      </section>

      <section className={tab === "update" ? "panel active" : "panel"}>
        <div className="stack">
          <Metric label="OTA" value={formatState(status.ota, t)} />
          <button type="button" disabled={busy} onClick={() => void run(t("checkUpdate"), async () => { await post("/api/ota/check"); await refresh(); })}>
            {t("checkUpdate")}
          </button>
          <button className="secondary" type="button" disabled={busy} onClick={() => void run(t("startUpdate"), async () => { await post("/api/ota/start"); await refresh(); })}>
            {t("startUpdate")}
          </button>
        </div>
      </section>

      <p className="message">{busy ? "..." : message}</p>

      <nav className="tabs" aria-label="main">
        <TabButton active={tab === "overview"} label={t("overview")} icon="⌁" onClick={() => setTab("overview")} />
        <TabButton active={tab === "network"} label={t("network")} icon="⇄" onClick={() => setTab("network")} />
        <TabButton active={tab === "device"} label={t("device")} icon="⚙" onClick={() => setTab("device")} />
        <TabButton active={tab === "update"} label={t("update")} icon="⇧" onClick={() => setTab("update")} />
      </nav>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value || "--"}</strong>
    </article>
  );
}

function CandidateList({ candidates, emptyLabel, onPick }: { candidates: BmsCandidate[]; emptyLabel: string; onPick: (mac: string) => void }) {
  if (candidates.length === 0) return <p className="empty">{emptyLabel}</p>;
  return (
    <div className="candidate-list">
      {candidates.map((candidate) => (
        <button key={candidate.mac} className="candidate" type="button" onClick={() => candidate.mac && onPick(candidate.mac)}>
          <span>
            <strong>{candidate.name || "Ant BMS"}</strong>
            <small>{candidate.mac || "--"}</small>
          </span>
          <small>{Number.isFinite(candidate.rssi) ? `${candidate.rssi} dBm` : ""}</small>
        </button>
      ))}
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button className={active ? "tab active" : "tab"} type="button" onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}

function normalizeBaseUrl(value: string) {
  return (value.trim() || "http://192.168.4.1").replace(/\/$/, "");
}

function formatMillivolts(value: number | null | undefined) {
  return Number.isFinite(value) ? `${((value as number) / 1000).toFixed(2)} V` : "--";
}

function formatState(value: unknown, t: (key: keyof typeof I18N.zh) => string) {
  const raw = String(value || "");
  const key = STATE_LABELS[raw];
  return key ? t(key) : raw || "--";
}

function parseMaybeJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return value;
  return JSON.parse(trimmed);
}
