import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { dashboardIcon, socBar, bars } from "./vendor/dashboard-parts";
import { bindDashboardMotion, updateDashboardMotion } from "./vendor/dashboard-motion";
import { bindDashboardPages } from "./vendor/dashboard-swipe";
import ClientUpdateCards, { UpdateCard } from "./UpdateCards";
import { updateUrl } from "./update-source";
import VehicleImage from "./VehicleImage";
import { ThemeButton } from "./DashboardTheme";
import DashboardSheet from "./DashboardSheet";
import RideHistory from "./RideHistory";

const CONTROL_SERVICE_UUID = "4f91e100-23b2-4ee7-9f9a-86d1093f0a01";
const CONTROL_TX_UUID = "4f91e100-23b2-4ee7-9f9a-86d1093f0a02";
const CONTROL_RX_UUID = "4f91e100-23b2-4ee7-9f9a-86d1093f0a03";

type Language = "zh" | "en";
type Transport = "http" | "ble";
type Tab = "overview" | "rides" | "device";
type DeviceSheet = "history";
type JsonRecord = Record<string, unknown>;

type Status = {
  soc_percent?: number | null;
  current_deci_amps?: number | null;
  controller_power_w?: number | null;
  controller_rpm?: number | null;
  controller_online?: boolean;
  controller_gear?: number | null;
  controller_temp_c?: number | null;
  motor_temp_c?: number | null;
  version?: string;
  speed?: string;
  speed_unit?: string;
  bms?: string;
  wifi?: string;
  ota?: string;
  local_battery_mv?: number | null;
  pack_voltage_mv?: number | null;
  bms_capacity_estimate_mah?: number | null;
  bms_capacity_estimate_state?: "ready" | "estimating" | "unsupported";
};

type RidePeak = {
  pack_voltage_mv?: number | null;
  current_deci_amps?: number | null;
  delta_cell_voltage_mv?: number | null;
  soc_percent?: number | null;
  temperatures_c?: (number | null)[];
};

type RideRecord = {
  current?: boolean;
  max_current?: RidePeak;
  max_delta?: RidePeak;
};

type RideSession = { id: number; start_s: number; elapsed_s: number; samples: number; calibrated: boolean; truncated: boolean };

type RideRecordsResponse = { records?: RideRecord[] };

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

type Localized = { zh: string; en: string };
type OnlineFirmware = {
  profile: string;
  name?: string;
  chip?: string;
  version?: string;
  url: string;
  size?: number;
  code?: string;
  note?: string;
};
type ManifestItem = {
  id: string;
  kind: "range" | "select" | "action" | "choice" | "upload" | "map";
  label: Localized;
  value?: string | number | null;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: Localized }[];
  endpoint?: string;
  options_endpoint?: string;
  submit_endpoint?: string;
  submit_key?: string;
  code_header?: string;
  accept?: string;
};
type ManifestSection = { id: string; label: Localized; submit?: { endpoint: string; method: "POST" }; items: ManifestItem[] };
type SettingsManifest = { protocol_version: 1; sections: ManifestSection[] };

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
    appDownload: "下载 App",
    battery: "电池",
    bindBms: "绑定 BMS",
    bleControlUnavailable: "固件未开启蓝牙控制服务",
    bluetoothUnsupported: "当前浏览器不支持 Web Bluetooth",
    bms: "BMS",
    bmsCapacityEstimate: "电池真实容量估算",
    capacityEstimating: "估算中",
    capacityUnsupported: "仅支持 ANT",
    bmsType: "保护板类型",
    brightness: "亮度",
    volume: "音量",
    connectBle: "蓝牙",
    connectHttp: "热点 API",
    connected: "已连接",
    connecting: "连接中",
    currentRide: "本次开机",
    device: "设备",
    deviceAddress: "设备地址",
    delta: "压差",
    disabled: "关闭",
    disconnected: "已断开",
    downloading: "下载中",
    failed: "失败",
    firmware: "固件",
    firmwareCode: "固件验证码",
    firmwareDownloading: "固件下载中",
    firmwareFile: "固件文件",
    httpConnected: "热点 API 已连接",
    idle: "空闲",
    language: "语言",
    maxCurrent: "最大电流",
    maxDelta: "最大压差",
    network: "网络",
    noCandidates: "暂无候选设备",
    noOnlineFirmware: "未查询到可用固件",
    noRideRecords: "暂无骑行峰值记录",
    offline: "离线",
    online: "在线",
    onlineFirmware: "在线固件",
    otaCodeMismatch: "固件验证码不匹配",
    otaFailed: "固件更新失败",
    otaHttpOnly: "OTA 需要先连接热点 API",
    otaInvalidCode: "请输入四位数字验证码",
    otaInvalidImage: "固件格式无效",
    otaPurpose: "选择应用固件并输入随固件生成的四位验证码。",
    otaRebooting: "校验通过，设备正在重启",
    otaSelectFile: "请选择固件文件",
    otaTooLarge: "固件超过 OTA 分区容量",
    otaUploading: "固件上传中，请勿断开连接",
    overview: "概览",
    queryFirmware: "查询可用固件",
    refresh: "刷新",
    rideRecord: "骑行记录",
    rideRecords: "骑行峰值记录",
    recentRides: "最近骑行",
    rideSessions: "骑行会话",
    elapsed: "时长",
    samples: "采样数",
    localRecord: "设备记录",
    noSessions: "暂无骑行会话",
    sessionUnavailable: "骑行历史未能读取，请连接设备后刷新",
    cast: "投屏",
    deviceTools: "设备工具",
    current: "电流",
    power: "功率",
    readyToReboot: "待重启",
    saved: "已保存",
    saveDevice: "保存设备",
    scanBms: "扫描 BMS",
    screenRotation: "屏幕方向",
    setupAp: "设置热点",
    speed: "速度",
    speedUnit: "速度单位",
    update: "更新",
    updateAvailable: "有更新",
    uploadFirmware: "上传并更新",
    verifying: "校验中",
    wifi: "Wi-Fi",
  },
  en: {
    apPassword: "Setup AP password",
    appDownload: "Download app",
    battery: "Battery",
    bindBms: "Bind BMS",
    bleControlUnavailable: "Firmware BLE control service is not enabled",
    bluetoothUnsupported: "Web Bluetooth is not supported",
    bms: "BMS",
    bmsCapacityEstimate: "Estimated real battery capacity",
    capacityEstimating: "Estimating",
    capacityUnsupported: "ANT only",
    bmsType: "BMS type",
    brightness: "Brightness",
    volume: "Volume",
    connectBle: "Bluetooth",
    connectHttp: "Hotspot API",
    connected: "connected",
    connecting: "connecting",
    currentRide: "Current boot",
    device: "Device",
    deviceAddress: "Device address",
    delta: "Delta",
    disabled: "disabled",
    disconnected: "disconnected",
    downloading: "downloading",
    failed: "failed",
    firmware: "Firmware",
    firmwareCode: "Firmware code",
    firmwareDownloading: "Downloading firmware",
    firmwareFile: "Firmware file",
    httpConnected: "Hotspot API connected",
    idle: "idle",
    language: "Language",
    maxCurrent: "Max current",
    maxDelta: "Max delta",
    network: "Network",
    noCandidates: "No candidates",
    noOnlineFirmware: "No firmware available",
    noRideRecords: "No ride peak records",
    offline: "offline",
    online: "online",
    onlineFirmware: "Online firmware",
    otaCodeMismatch: "Firmware code does not match",
    otaFailed: "Firmware update failed",
    otaHttpOnly: "Connect through the hotspot API before OTA",
    otaInvalidCode: "Enter the four-digit firmware code",
    otaInvalidImage: "Invalid firmware image",
    otaPurpose: "Select an app image and enter its generated four-digit code.",
    otaRebooting: "Verified; the device is restarting",
    otaSelectFile: "Select a firmware file",
    otaTooLarge: "Firmware exceeds the OTA partition size",
    otaUploading: "Uploading firmware; keep the connection open",
    overview: "Overview",
    queryFirmware: "Query firmware",
    refresh: "Refresh",
    rideRecord: "Ride record",
    rideRecords: "Ride peak records",
    recentRides: "Recent rides",
    rideSessions: "Ride sessions",
    elapsed: "Duration",
    samples: "Samples",
    localRecord: "Device record",
    noSessions: "No ride sessions yet",
    sessionUnavailable: "Ride history unavailable. Connect the device and refresh.",
    cast: "Cast",
    deviceTools: "Device tools",
    current: "Current",
    power: "Power",
    readyToReboot: "ready to reboot",
    saved: "Saved",
    saveDevice: "Save device",
    scanBms: "Scan BMS",
    screenRotation: "Screen rotation",
    setupAp: "Setup AP",
    speed: "Speed",
    speedUnit: "Speed unit",
    update: "Update",
    updateAvailable: "update available",
    uploadFirmware: "Upload and update",
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
  const english = new URLSearchParams(window.location.search).get("lang") === "en";

  useEffect(() => {
    const timer = window.setTimeout(() => { window.location.href = deepLink; }, 150);
    return () => window.clearTimeout(timer);
  }, [deepLink]);

  return (
    <main className="cast-landing">
      <p className="eyebrow">{english ? "BMS REMOTE CAST" : "BMS 远程投屏"}</p>
      <h1>{english ? "Opening the casting app…" : "正在打开投屏 App…"}</h1>
      <p>{english ? "The BMS casting app opens automatically when installed. Make sure the phone is connected to the device hotspot." : "已安装 BMS 投屏 App 时将自动打开。请确认手机已连接设备热点。"}</p>
      <a className="cast-open" href={deepLink}>{english ? "Open BMS Casting App" : "打开 BMS 投屏 App"}</a>
      <p className="cast-help">{english ? "If the app is not installed, install the APK and scan again." : "若未安装 App，请安装 APK 后重新扫码。"}</p>
      <a className="cast-download" href="/apk/两轮智控.apk" download>{english ? "Download the latest APK" : "下载最新版 App"}</a>
    </main>
  );
}

export default function App() {
  if (window.location.pathname === "/cast") return <CastLanding />;
  const [language, setLanguage] = useState<Language>("zh");
  const [transport, setTransport] = useState<Transport>("http");
  const [tab, setTab] = useState<Tab>("overview");
  const [deviceSheet, setDeviceSheet] = useState<DeviceSheet | null>(null);
  const [appInfo] = useState<{ versionName?: string; versionCode?: number }>(() => {
    try {
      const info = JSON.parse(window.BmsNative?.getAppInfo?.() || "{}");
      return { versionName: typeof info?.versionName === "string" ? info.versionName : undefined,
        versionCode: typeof info?.versionCode === "number" ? info.versionCode : undefined };
    } catch { return {}; }
  });
  const [baseUrl, setBaseUrl] = useState("http://192.168.4.1");
  const [status, setStatus] = useState<Status>({});
  const [config, setConfig] = useState<Config>({
    language: "zh",
    display_rotation: "landscape",
    speed_unit: "km/h",
    bms_type: "ant",
  });
  const [manifest, setManifest] = useState<SettingsManifest>();
  const [settingsValues, setSettingsValues] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<BmsCandidate[]>([]);
  const [sessions, setSessions] = useState<RideSession[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const native = window.BmsNative;
  const phoneRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => phoneRef.current ? bindDashboardMotion(phoneRef.current) : undefined, []);
  useEffect(() => phoneRef.current ? bindDashboardPages(phoneRef.current) : undefined, []);
  const [rideRecords, setRideRecords] = useState<RideRecord[]>([]);
  const [firmwareFile, setFirmwareFile] = useState<File>();
  const [firmwareCode, setFirmwareCode] = useState("");
  const [onlineFirmwares, setOnlineFirmwares] = useState<OnlineFirmware[]>([]);
  const [onlineFirmware, setOnlineFirmware] = useState<OnlineFirmware>();
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [firmwareCheck, setFirmwareCheck] = useState<"idle" | "checked" | "error">("idle");
  const [firmwareCheckError, setFirmwareCheckError] = useState("");
  const [message, setMessage] = useState("未连接");
  const [busy, setBusy] = useState(false);
  const [ble, setBle] = useState<BleState>({});
  const transportRef = useRef<Transport>("http");
  const bleRef = useRef<BleState>({});
  const pendingBle = useRef(new Map<number, PendingBle>());
  const bleBuffer = useRef(new Uint8Array(0));
  const bleRequestId = useRef(0);

  const t = useMemo(() => {
    return (key: keyof typeof I18N.zh) => I18N[language][key] || I18N.zh[key] || key;
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: number }>();
    window.__bmsNativeReply = (id, payload) => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      window.clearTimeout(request.timer);
      try {
        const result = JSON.parse(payload);
        if (result.ok) request.resolve(result.body);
        else request.reject(new Error(result.error || "Device request failed"));
      } catch (error) { request.reject(error instanceof Error ? error : new Error(String(error))); }
    };
    window.bmsNativeRequest = (method, path, body, host) => new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = window.setTimeout(() => { pending.delete(id); reject(new Error("Device request timed out")); }, 15000);
      pending.set(id, { resolve, reject, timer });
      try { native!.request(id, method, path, body, host); }
      catch (error) { window.clearTimeout(timer); pending.delete(id); reject(error); }
    });
    return () => {
      for (const request of pending.values()) { window.clearTimeout(request.timer); request.reject(new Error("Page closed")); }
      delete window.__bmsNativeReply;
      delete window.bmsNativeRequest;
    };
  }, [native]);

  useEffect(() => {
    if (!connected || busy) return;
    let refreshing = false;
    const timer = window.setInterval(async () => {
      if (refreshing || document.hidden) return;
      refreshing = true;
      try { await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      finally { refreshing = false; }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [connected, busy, baseUrl, transport]);

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
    if (native && window.bmsNativeRequest) {
      return window.bmsNativeRequest(options.method || "GET", path, String(options.body || ""), transportRef.current === "ble" ? "ble" : baseUrl);
    }
    const currentBle = bleRef.current;
    if (transportRef.current === "ble" && currentBle.tx && currentBle.rx) {
      return bleApi(path, options);
    }
    return httpApi(path, options);
  }

  async function httpApi(path: string, options: RequestInit = {}): Promise<unknown> {
    if (native && window.bmsNativeRequest) return window.bmsNativeRequest(options.method || "GET", path, String(options.body || ""), baseUrl);
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
    if (pendingBle.current.size) throw new Error("蓝牙请求处理中，请稍后重试");
    const id = bleRequestId.current = (bleRequestId.current % 0xffffffff) + 1;
    const request = {
      v: 1,
      id,
      method: options.method || "GET",
      path,
      body: options.body ? JSON.parse(String(options.body)) : null,
    };
    bleBuffer.current = new Uint8Array(0);
    const promise = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingBle.current.delete(id);
        bleBuffer.current = new Uint8Array(0);
        reject(new Error("蓝牙请求超时"));
      }, 10000);
      pendingBle.current.set(id, { resolve, reject, timer });
    });
    try {
      await writeBleText(currentBle.tx, JSON.stringify(request));
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
    if (bytes.length > 512) throw new Error("蓝牙请求过大");
    // Browsers do not expose ATT MTU; 19 payload bytes also fit the default MTU 23.
    for (let offset = 0; offset < bytes.length; offset += 19) {
      const payload = bytes.slice(offset, offset + 19);
      const chunk = new Uint8Array(payload.length + 1);
      chunk[0] = (offset === 0 ? 1 : 0) | (offset + 19 >= bytes.length ? 2 : 0);
      chunk.set(payload, 1);
      if (tx.writeValueWithResponse) {
        await tx.writeValueWithResponse(chunk);
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
    try {
      const chunk = new Uint8Array(target.value.buffer, target.value.byteOffset, target.value.byteLength);
      if (!chunk.length || (chunk[0] & 0xfc)) throw new Error("蓝牙响应分片无效");
      if (chunk[0] & 1) bleBuffer.current = new Uint8Array(0);
      else if (!bleBuffer.current.length) throw new Error("蓝牙响应缺少起始分片");
      const bytes = new Uint8Array(bleBuffer.current.length + chunk.length - 1);
      if (bytes.length > 4096) throw new Error("蓝牙响应过大");
      bytes.set(bleBuffer.current);
      bytes.set(chunk.subarray(1), bleBuffer.current.length);
      bleBuffer.current = bytes;
      if (chunk[0] & 2) {
        bleBuffer.current = new Uint8Array(0);
        resolveBleLine(decoder.decode(bytes));
      }
    } catch (error) {
      bleBuffer.current = new Uint8Array(0);
      for (const pending of pendingBle.current.values()) {
        window.clearTimeout(pending.timer);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
      pendingBle.current.clear();
    }
  }

  function resolveBleLine(line: string) {
    const message = JSON.parse(line) as { id?: number; status?: number; body?: unknown };
    if (!Number.isInteger(message.id) || !Number.isInteger(message.status)) throw new Error("蓝牙响应格式无效");
    if (!message.id) return;
    const pending = pendingBle.current.get(message.id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingBle.current.delete(message.id);
    if (message.status! < 200 || message.status! >= 300) {
      pending.reject(new Error(`BLE ${message.status}: ${String(message.body || "")}`));
      return;
    }
    pending.resolve(message.body);
  }

  async function connectHttp() {
    await run(t("httpConnected"), async () => {
      setCurrentTransport("http");
      await loadManifest();
      await refresh();
    });
  }

  async function connectBle() {
    await run("BLE", async () => {
      if (native) {
        native.connectBle();
        const deadline = Date.now() + 60000;
        while (!native.bleConnected()) {
          if (Date.now() > deadline) throw new Error(t("disconnected"));
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
        setCurrentTransport("ble");
        await loadManifest();
        await refresh();
        return;
      }
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
        for (const request of pendingBle.current.values()) { window.clearTimeout(request.timer); request.reject(new Error(t("disconnected"))); }
        pendingBle.current.clear();
        bleBuffer.current = new Uint8Array();
        setConnected(false);
        setStatus({});
        setCurrentBle({});
        setCurrentTransport("http");
        setMessage(t("disconnected"));
      });
      setCurrentBle({ tx, rx, deviceName: device.name || device.id });
      setCurrentTransport("ble");
      await loadManifest();
      await refresh();
    });
  }

  async function refresh() {
    let data: Status;
    try { data = (await api("/api/status")) as Status; }
    catch (error) { setConnected(false); setStatus({}); setSessions([]); setRideRecords([]); setHistoryAvailable(false); throw error; }
    setStatus(data);
    setConnected(true);
    try {
      const history = (await api("/api/history/sessions")) as { ready?: boolean; sessions?: RideSession[] };
      setSessions(Array.isArray(history.sessions) ? [...history.sessions].sort((a, b) => b.id - a.id) : []);
      setHistoryAvailable(history.ready === true);
    } catch { setSessions([]); setHistoryAvailable(false); }
    if (transportRef.current === "ble") { setRideRecords([]); return; }
    try {
      const history = (await httpApi("/api/bms/ride-records")) as RideRecordsResponse;
      setRideRecords(Array.isArray(history.records) ? history.records : []);
    } catch {
      setRideRecords([]);
    }
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

  async function loadManifest() {
    setManifest(undefined);
    setSettingsValues({});
    try {
      const data = (await api("/api/settings/manifest")) as SettingsManifest;
      if (data.protocol_version !== 1 || !Array.isArray(data.sections) || !data.sections.every(validSection)) {
        throw new Error("固件不支持动态设置，请升级");
      }
      const values: Record<string, string> = {};
      for (const item of data.sections.flatMap((section) => section.items)) {
        if (typeof item.value === "string" || typeof item.value === "number") values[item.id] = String(item.value);
      }
      setManifest(data);
      setSettingsValues(values);
      const languageItem = data.sections.flatMap((section) => section.items).find((item) => item.id === "language");
      setLanguage(languageItem?.value === "en" ? "en" : "zh");
    } catch (error) {
      setMessage(error instanceof Error && error.message !== "404 Not Found" ? error.message : "固件不支持动态设置，请升级");
    }
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
      if (!/^[0-9]{8}$/.test(body.password || "")) throw new Error(language === "zh" ? "密码必须为 8 位数字" : "Password must contain 8 digits");
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

  const submitSection = (section: ManifestSection, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!section.submit) return;
    void run(t("saved"), async () => {
      await post(section.submit!.endpoint, Object.fromEntries(new FormData(event.currentTarget)) as JsonRecord);
      await loadManifest();
      await refresh();
    });
  };

  const runAction = (item: ManifestItem) => {
    if (!item.endpoint) return;
    void run(item.label[language], async () => { await post(item.endpoint!); await loadManifest(); });
  };

  const submitChoice = (item: ManifestItem) => {
    if (!item.submit_endpoint || !item.submit_key) return;
    void run(t("saved"), async () => {
      await post(item.submit_endpoint!, { [item.submit_key!]: settingsValues[item.id] || "" });
      await loadManifest();
    });
  };

  const loadChoices = (item: ManifestItem) => {
    if (!item.options_endpoint) return;
    void run(item.label[language], async () => {
      const data = (await api(item.options_endpoint!)) as { candidates?: BmsCandidate[] };
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    });
  };

  const submitFirmware = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (transportRef.current !== "http") {
      setMessage(t("otaHttpOnly"));
      return;
    }
    if (!firmwareFile) {
      setMessage(t("otaSelectFile"));
      return;
    }
    if (!/^[0-9]{4}$/.test(firmwareCode)) {
      setMessage(t("otaInvalidCode"));
      return;
    }

    void run(t("otaRebooting"), async () => {
      setMessage(t("otaUploading"));
      const upload = manifest?.sections.flatMap((section) => section.items).find((item) => item.kind === "upload");
      if (!upload?.endpoint || !upload.code_header) throw new Error("固件不支持动态设置，请升级");
      const response = await fetch(normalizeBaseUrl(baseUrl) + upload.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          [upload.code_header]: firmwareCode,
        },
        body: firmwareFile,
        mode: "cors",
        cache: "no-store",
        targetAddressSpace: "local",
      } as RequestInit);
      if (!response.ok) throw new Error(otaError(response.status, t));
    });
  };

  async function loadOnlineFirmwares() {
    if (onlineLoading) return;
    setOnlineLoading(true);
    setFirmwareCheckError("");
    try {
      const response = await fetch(updateUrl("firmware/firmware.json"), { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { firmwares?: OnlineFirmware[] };
      if (!Array.isArray(data.firmwares)) throw new Error(language === "zh" ? "无效的固件更新清单" : "Invalid firmware manifest");
      setFirmwareCheck("checked");
      setOnlineFirmwares(Array.isArray(data.firmwares) ? data.firmwares.map((item) => ({ ...item, url: new URL(item.url, response.url).href })) : []);
      if (!Array.isArray(data.firmwares) || data.firmwares.length === 0) setMessage(t("noOnlineFirmware"));
    } catch (error) {
      setFirmwareCheck("error");
      setFirmwareCheckError(error instanceof Error ? error.message : String(error));
    } finally {
      setOnlineLoading(false);
    }
  }

  async function pickOnlineFirmware(profile: string) {
    const selected = onlineFirmwares.find((item) => item.profile === profile);
    if (!selected) return;
    setBusy(true);
    try {
      setMessage(t("firmwareDownloading"));
      const response = await fetch(selected.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      setFirmwareFile(new File([blob], `${selected.profile}.bin`, { type: "application/octet-stream" }));
      setFirmwareCode(selected.code || "");
      setOnlineFirmware(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (phoneRef.current) updateDashboardMotion(phoneRef.current, tab, { busy });
  });

  const battery = formatMillivolts(status.pack_voltage_mv ?? status.local_battery_mv);

  const soc = typeof status.soc_percent === "number" && Number.isFinite(status.soc_percent) ? Math.max(0, Math.min(100, status.soc_percent)) : null;

  return (
    <div className={`stage ${native ? "native-app" : "web-preview"}`}>
    <div className="phone has-tabveil" id="phone" ref={phoneRef}>
      {!native && <>
        <div className="preview-statusbar" aria-label={language === "zh" ? "手机预览状态栏" : "Phone preview status bar"}>
          <span className="tnum">{clock.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          <span aria-hidden="true"><svg viewBox="0 0 20 16" fill="currentColor"><path d="M1 15V11h3v4zm5 0V8h3v7zm5 0V5h3v10zm5 0V1h3v14z"/></svg><svg viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 5q9-8 18 0M4 8q6-5 12 0M7 11q3-3 6 0"/><circle cx="10" cy="14" r="1" fill="currentColor" stroke="none"/></svg><svg viewBox="0 0 24 14" fill="none" stroke="currentColor"><rect x="1" y="1" width="19" height="12" rx="3"/><path d="M22 5v4"/><rect x="3" y="3" width="15" height="8" rx="1" fill="currentColor" stroke="none"/></svg></span>
        </div>
        <div className="preview-camera" aria-hidden="true" />
        <div className="preview-home-indicator" aria-hidden="true" />
      </>}
      <header className="topbar" id="topbar">
        <div className="topbar-controls">
          <span className="app-title">两轮智控</span>
          <span className="spacer" />
          <button className="iconbtn" type="button" disabled={busy} aria-label={t("refresh")} onClick={() => void run(t("refresh"), refresh)}>
            {busy ? <span className="loading-ring" aria-hidden="true" /> : <DashboardIcon name="refresh" size={22} />}
          </button>
          <ThemeButton language={language} />
        </div>
        <div className="topbar-page-title" role="heading" aria-level={1} aria-hidden="true">{tab === "rides" ? (language === "zh" ? "功能" : "Features") : tab === "device" ? (language === "zh" ? "设置" : "Settings") : (language === "zh" ? "爱车" : "Vehicle")}</div>
      </header>
      <div className="loadbar" id="loadbar" aria-hidden="true" />
      <div className="scroll" id="scroll">
      <section className={tab === "overview" ? "panel page active" : "panel page"}>
        <article className="card hero-card">
          <div className="hero-top"><span className={`chip${connected ? " accent" : ""}`}><i className="dot" />{t(connected ? "connected" : "disconnected")}</span><span className="chip"><i className="dot" />{transport === "ble" ? "Bluetooth" : "Wi-Fi"}</span></div>
          <div className="hero-stage">
            <div className="bignum left"><b className="tnum"><span data-num={soc ?? ""} data-key="soc">{soc ?? "—"}</span><i>%</i></b></div>
            <VehicleImage language={language} />
            <div className="bignum right volt"><b className="tnum vnum"><span data-num={battery === "--" ? "" : battery.replace(/ V$/, "")} data-key="voltage">{battery.replace(/ V$/, "")}</span><i>V</i></b></div>
          </div>
          <div role="progressbar" aria-label={t("battery")} aria-valuenow={soc ?? undefined} aria-valuemin={0} aria-valuemax={100} dangerouslySetInnerHTML={{ __html: socBar(soc ?? 0, "var(--md-sys-color-primary)", false, true) }} />
          <div className="hero-meta"><span>{t("firmware")} {status.version || "—"}</span><i className="sep" /><span>{t("bms")} {formatState(status.bms, t)}</span></div>
        </article>
        <div className="card hero-grid grid2">
          <Metric label={t("speed")} value={`${status.speed ?? "—"} ${status.speed_unit || "km/h"}`} />
          <Metric label={t("current")} value={formatDeciAmps(status.current_deci_amps)} />
          <Metric label={t("power")} value={status.controller_power_w == null ? "—" : `${status.controller_power_w} W`} />
          <Metric label={t("bmsCapacityEstimate")} value={formatBmsCapacityEstimate(status, t)} />
        </div>
        <section className="actions device-actions">
          <button className="action" type="button" disabled={busy} onClick={() => void connectHttp()}><span className="ico"><DashboardIcon name="link" size={20} /></span><span className="lbl">{t("connectHttp")}</span></button>
          <button className="action" type="button" disabled={busy} onClick={() => void connectBle()}><span className="ico"><DashboardIcon name="bolt" size={20} /></span><span className="lbl">{t("connectBle")}</span></button>
          {native && <button className="action" type="button" onClick={() => native.openNative("CAST")}><span className="ico"><DashboardIcon name="gauge" size={20} /></span><span className="lbl">{t("cast")}</span></button>}
          {native && <button className="action" type="button" onClick={() => native.openNative("BMS")}><span className="ico"><DashboardIcon name="gear" size={20} /></span><span className="lbl">{t("deviceTools")}</span></button>}
        </section>
        <section className="card ride-card recent-rides">
          <div className="card-head"><span className="muted"><DashboardIcon name="route" size={18} /></span><div className="card-title">{t("recentRides")}</div><span className="spacer"/><button className="iconbtn" type="button" onClick={() => setDeviceSheet("history")} aria-label={t("rideSessions")}><DashboardIcon name="right" size={18} /></button></div>
          {historyAvailable && sessions.length > 0 ? <>
            <div className="grid2"><Metric label={t("rideSessions")} value={String(sessions.length)} /><Metric label={t("elapsed")} value={`${Math.floor(sessions.reduce((sum, ride) => sum + ride.elapsed_s, 0) / 60)} min`} /></div>
            <div className="card-sub mt8">{language === "zh" ? "最近 7 次骑行时长 · 分钟" : "Last 7 rides · minutes"}</div>
            <div dangerouslySetInnerHTML={{ __html: bars(sessions.slice(0, 7).reverse().map(ride => ({ date: `${t("localRecord")} #${ride.id}`, day: ride.id, mile: Math.round(ride.elapsed_s / 6) / 10 })), language === "zh" ? "分钟" : "min", 0) }} />
          </> : <SessionList sessions={[]} language={language} t={t} available={historyAvailable} />}

        </section>
      </section>

      <section className={tab === "rides" ? "panel page active" : "panel page"} aria-label={language === "zh" ? "功能" : "Features"} />

      <section className={tab === "device" ? "panel page active" : "panel page"} aria-label={language === "zh" ? "设置" : "Settings"}>
        <section className="card stack settings-detail" aria-labelledby="settings-bluetooth-title">
          <div className="card-head"><span className="muted"><DashboardIcon name="bt" size={20} /></span><h2 className="card-title" id="settings-bluetooth-title">{language === "zh" ? "蓝牙连接" : "Bluetooth connection"}</h2></div>
          <Metric label={language === "zh" ? "设备蓝牙" : "Device Bluetooth"} value={transport === "ble" && connected ? t("connected") : t("disconnected")} />
          <p className="empty">{language === "zh" ? "连接两轮智控面板，读取车辆状态并修改设备设置。" : "Connect to the panel to read vehicle status and change device settings."}</p>
          <button className="btn" type="button" disabled={busy} onClick={() => void connectBle()}>{t("connectBle")}</button>
        </section>
        <section className="card stack settings-detail" aria-labelledby="settings-wifi-title">
          <div className="card-head"><span className="muted"><DashboardIcon name="wifi" size={20} /></span><h2 className="card-title" id="settings-wifi-title">{language === "zh" ? "Wi-Fi 连接" : "Wi-Fi connection"}</h2></div>
        <div className="stack">
          <Metric label={language === "zh" ? "连接状态" : "Connection"} value={transport === "http" && connected ? t("connected") : t("disconnected")} />
          <label>
            <span>{t("deviceAddress")}</span>
            <input value={baseUrl} inputMode="url" onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <button className="btn block" type="button" disabled={busy} onClick={() => void connectHttp()}>{t("connectHttp")}</button>
        </div>

        <form className="stack" onSubmit={submitApPassword}>
          <label>
            <span>{t("apPassword")}</span>
            <input name="password" type="password" minLength={8} maxLength={8} inputMode="numeric" pattern="[0-9]{8}" autoComplete="new-password" required />
          </label>
          <button type="submit" disabled={busy || transport === "ble"}>
            {t("setupAp")}
          </button>
        </form>
        </section>
        <section className="card stack settings-detail" aria-labelledby="settings-system-title">
          <div className="card-head"><span className="muted"><DashboardIcon name="info" size={20} /></span><h2 className="card-title" id="settings-system-title">{language === "zh" ? "系统信息" : "System information"}</h2></div>
          <section className="stack version-list">
            <div className="kv"><span className="k">{language === "zh" ? "面板版本" : "Panel version"}</span><span className="v">{status.version || "—"}</span></div>
            <div className="kv"><span className="k">{language === "zh" ? "App 版本" : "App version"}</span><span className="v">{native ? (appInfo.versionName ? `${appInfo.versionName}${appInfo.versionCode ? ` (${appInfo.versionCode})` : ""}` : "—") : (language === "zh" ? "网页预览" : "Web preview")}</span></div>
          </section>
          <section className="stack"><h2>{language === "zh" ? "控制器状态" : "Controller status"}</h2><div className="grid2">
            <Metric label={language === "zh" ? "连接状态" : "Connection"} value={status.controller_online == null ? "—" : t(status.controller_online ? "connected" : "disconnected")} />
            <Metric label={language === "zh" ? "挡位" : "Gear"} value={status.controller_gear == null ? "—" : status.controller_gear === 0 ? "N" : status.controller_gear === 1 ? "D" : status.controller_gear === 2 ? "R" : String(status.controller_gear)} />
            <Metric label={language === "zh" ? "转速" : "RPM"} value={status.controller_rpm == null ? "—" : `${status.controller_rpm} rpm`} />
            <Metric label={t("power")} value={status.controller_power_w == null ? "—" : `${status.controller_power_w} W`} />
            <Metric label={language === "zh" ? "控制器温度" : "Controller temperature"} value={status.controller_temp_c == null ? "—" : `${status.controller_temp_c} °C`} />
            <Metric label={language === "zh" ? "电机温度" : "Motor temperature"} value={status.motor_temp_c == null ? "—" : `${status.motor_temp_c} °C`} />
          </div></section>
          {native && <div className="button-row">
            <button className="btn tonal" type="button" onClick={() => native.openNative("CAST")}>{t("cast")}</button>
            <button className="btn tonal" type="button" onClick={() => native.openNative("BMS")}>{t("deviceTools")}</button>
            <button className="btn tonal" type="button" onClick={() => native.openNative("RECORDS")}>{language === "zh" ? "原生记录与轨迹" : "Native records and tracks"}</button>
          </div>}
        </section>
        <section className="card stack settings-detail" aria-labelledby="settings-device-title">
          <div className="card-head"><span className="muted"><DashboardIcon name="gear" size={20} /></span><h2 className="card-title" id="settings-device-title">{language === "zh" ? "设备设置" : "Device settings"}</h2></div>
        {manifest ? manifest.sections.filter((section) => section.id !== "update").map((section) => (
          <form className="stack" key={section.id} onSubmit={(event) => submitSection(section, event)}>
            <h2>{section.label[language]}</h2>
            {transport === "ble" && section.items.some((item) => ["action", "choice", "map"].includes(item.kind)) && <p className="empty">{language === "zh" ? "此功能需要连接设备热点" : "Connect to the device hotspot to use this feature"}</p>}
            {section.items.map((item) => <ManifestControl key={item.id} item={item} language={language} busy={busy || (transport === "ble" && ["action", "choice", "map"].includes(item.kind))} value={settingsValues[item.id] || ""} candidates={candidates} onValue={(value) => setSettingsValues({ ...settingsValues, [item.id]: value })} onAction={() => runAction(item)} onLoadChoices={() => loadChoices(item)} onSubmitChoice={() => submitChoice(item)} loadTrack={async () => await api(item.endpoint!) as { points?: TrackPoint[] }} />)}
            {section.items.some((item) => item.id === "bms_type") && <Metric label={t("bmsCapacityEstimate")} value={formatBmsCapacityEstimate(status, t)} />}
            {section.submit && <button type="submit" disabled={busy}>{t("saveDevice")}</button>}
          </form>
        )) : <p className="empty">{language === "zh" ? "连接设备后显示配置项" : "Connect to the device to view settings"}</p>}
        </section>
        <ClientUpdateCards language={language} appInfo={appInfo} />
        <UpdateCard title={language === "zh" ? "固件更新" : "Firmware update"} version={`${language === "zh" ? "当前面板" : "Current panel"} ${status.version || "—"}`} checking={onlineLoading} onCheck={() => void loadOnlineFirmwares()} status={onlineLoading ? (language === "zh" ? "正在检查…" : "Checking…") : firmwareCheck === "error" ? (language === "zh" ? "检查失败，点击重试" : "Failed; tap to retry") : firmwareCheck === "checked" ? (language === "zh" ? `找到 ${onlineFirmwares.length} 款固件` : `${onlineFirmwares.length} releases found`) : (language === "zh" ? "查找更新" : "Check for updates")}>
        {firmwareCheckError && <p className="empty" role="status">{firmwareCheckError}</p>}
        <div className="stack">
          <h2>{t("onlineFirmware")}</h2>
          <div className="button-row">
            <select
              value={onlineFirmware?.profile || ""}
              disabled={busy || onlineFirmwares.length === 0}
              onChange={(event) => void pickOnlineFirmware(event.target.value)}
            >
              <option value="">{onlineFirmwares.length === 0 ? t("noOnlineFirmware") : "—"}</option>
              {onlineFirmwares.map((item) => (
                <option key={item.profile} value={item.profile}>
                  {`${item.name || item.profile}${item.version ? ` v${item.version}` : ""}${item.chip ? ` [${item.chip}]` : ""}`}
                </option>
              ))}
            </select>
          </div>
          <p className="card-sub">{language === "zh" ? "选择匹配硬件的固件后下载；刷写前仍需确认文件和验证码。" : "Download firmware matching your hardware, then confirm the file and verification code before flashing."}</p>
        </div>
        {manifest?.sections.filter((section) => section.id === "update").map((section) => (
          <form className="stack" key={section.id} onSubmit={submitFirmware}>
            <h2>{section.label[language]}</h2>
            <ManifestControl item={section.items[0]} language={language} busy={busy} value="" candidates={[]} onValue={() => {}} onAction={() => {}} onLoadChoices={() => {}} onSubmitChoice={() => {}} />
            <label><span>{t("firmwareFile")}</span><input type="file" accept={section.items[0]?.accept} required onChange={(event) => { setFirmwareFile(event.target.files?.[0]); setFirmwareCode(""); }} /></label>
            <label><span>{t("firmwareCode")}</span><input value={firmwareCode} inputMode="numeric" minLength={4} maxLength={4} required onChange={(event) => setFirmwareCode(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            <button type="submit" disabled={busy || transport !== "http" || !firmwareFile || !/^[0-9]{4}$/.test(firmwareCode)}>{section.items[0]?.label[language]}</button>
          </form>
        ))}
        </UpdateCard>
      </section>

      {tab !== "rides" && <p className="message" role="status">{busy ? <span className="loading-ring" aria-hidden="true" /> : message}</p>}
      </div>

      <nav className="tabbar" id="tabbar" aria-label="main">
        <span className="tab-ind" aria-hidden="true" />
        <TabButton active={tab === "overview"} label={language === "zh" ? "爱车" : "Vehicle"} icon="speed" tab="overview" onClick={() => setTab("overview")} />
        <TabButton active={tab === "rides"} label={language === "zh" ? "功能" : "Features"} icon="route" tab="rides" onClick={() => setTab("rides")} />
        <TabButton active={tab === "device"} label={language === "zh" ? "设置" : "Settings"} icon="gear" tab="device" onClick={() => setTab("device")} />
      </nav>
      <DashboardSheet open={deviceSheet !== null} title={language === "zh" ? "行驶历史" : "Ride history"} closeLabel={language === "zh" ? "关闭" : "Close"} onClose={() => setDeviceSheet(null)}>
        <div className="device-forms">
        {deviceSheet === "history" && <>
          <RideHistory sessions={sessions} language={language} load={api} />
          <RideRecordList records={rideRecords} t={t} />
        </>}
        <p className="message" role="status">{busy ? <span className="loading-ring" aria-hidden="true" /> : message}</p>
        </div>
      </DashboardSheet>
    </div>
    </div>
  );
}

function SessionList({ sessions, language, t, available }: { sessions: RideSession[]; language: Language; t: (key: keyof typeof I18N.zh) => string; available: boolean }) {
  if (!available) return <p className="empty">{t("sessionUnavailable")}</p>;
  if (!sessions.length) return <p className="empty">{t("noSessions")}</p>;
  return <div className="ride-records">{sessions.map((session) => <article className="ride-record" key={session.id}>
    <strong>{session.calibrated && session.start_s > 0 ? new Date(session.start_s * 1000).toLocaleString(language === "zh" ? "zh-CN" : "en-US") : `${t("localRecord")} #${session.id}`}</strong>
    <div className="grid2"><Metric label={t("elapsed")} value={`${Math.floor(session.elapsed_s / 60)}m ${session.elapsed_s % 60}s`} /><Metric label={t("samples")} value={String(session.samples)} /></div>
  </article>)}</div>;
}

function otaError(status: number, t: (key: keyof typeof I18N.zh) => string) {
  if (status === 403) return t("otaCodeMismatch");
  if (status === 413) return t("otaTooLarge");
  if (status === 422) return t("otaInvalidImage");
  return t("otaFailed");
}

function Metric({ label, value }: { label: string; value: string }) {
  const number = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  return <div className="stat"><span className="k">{label}</span><span className="v tnum">
    {number ? <><span data-num={number[1]} data-key={`metric-${label}`}>{number[1]}</span><small>{number[2]}</small></> : value || "--"}
  </span></div>;
}

function RideRecordList({ records, t }: { records: RideRecord[]; t: (key: keyof typeof I18N.zh) => string }) {
  return (
    <section className="ride-records">
      <h2>{t("rideRecords")}</h2>
      {records.length === 0 ? <p className="empty">{t("noRideRecords")}</p> : records.map((record, index) => (
        <article className="ride-record" key={`${record.current ? "current" : "history"}-${index}`}>
          <strong>{record.current ? t("currentRide") : `${t("rideRecord")} ${index + 1}`}</strong>
          <RidePeakSummary label={t("maxCurrent")} peak={record.max_current} deltaLabel={t("delta")} />
          <RidePeakSummary label={t("maxDelta")} peak={record.max_delta} deltaLabel={t("delta")} />
        </article>
      ))}
    </section>
  );
}

function RidePeakSummary({ label, peak, deltaLabel }: { label: string; peak?: RidePeak; deltaLabel: string }) {
  const temperatures = peak?.temperatures_c
    ?.filter((value): value is number => Number.isFinite(value))
    .map((value) => `${value}C`)
    .join("/") || "--";
  const delta = Number.isFinite(peak?.delta_cell_voltage_mv) ? `${peak!.delta_cell_voltage_mv} mV` : "--";
  const soc = Number.isFinite(peak?.soc_percent) ? `${peak!.soc_percent}%` : "--";
  return <p className="ride-peak"><strong>{label}</strong><span>{formatMillivolts(peak?.pack_voltage_mv)} | {formatDeciAmps(peak?.current_deci_amps)} | {deltaLabel} {delta} | {soc} | T {temperatures}</span></p>;
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

type TrackPoint = { lat_e7: number; lon_e7: number };

function TrackPreview({ load, language, disabled }: { load: () => Promise<{ points?: TrackPoint[] }>; language: Language; disabled: boolean }) {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const xs = points.map((p) => p.lon_e7), ys = points.map((p) => p.lat_e7);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const scale = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
  const line = points.map((p) => `${10 + (p.lon_e7 - minX) / scale * 280},${290 - (p.lat_e7 - minY) / scale * 280}`).join(" ");
  return <div className="stack"><button type="button" disabled={loading || disabled} onClick={async () => {
    setLoading(true);
    try { const data = await load(); const valid = (data.points || []).filter((p) => Number.isFinite(p.lat_e7) && Number.isFinite(p.lon_e7) && Math.abs(p.lat_e7) <= 900000000 && Math.abs(p.lon_e7) <= 1800000000); setPoints(valid); setMessage(valid.length ? "" : language === "zh" ? "暂无 GPS 轨迹" : "No GPS track yet"); }
    catch (error) { setMessage(String(error)); } finally { setLoading(false); }
  }}>{language === "zh" ? "读取 GPS 轨迹" : "Load GPS track"}</button>{points.length > 0 && <svg viewBox="0 0 300 300" role="img" aria-label={language === "zh" ? "GPS 轨迹" : "GPS track"}><polyline points={line} fill="none" stroke="currentColor" strokeWidth="3" /></svg>}<p className="empty" role="status">{message}</p></div>;
}

function ManifestControl({ item, language, busy, value, candidates, onValue, onAction, onLoadChoices, onSubmitChoice, loadTrack }: {
  item: ManifestItem; language: Language; busy: boolean; value: string; candidates: BmsCandidate[];
  loadTrack?: () => Promise<{ points?: TrackPoint[] }>;
  onValue: (value: string) => void; onAction: () => void; onLoadChoices: () => void; onSubmitChoice: () => void;
}) {
  if (item.kind === "map") return loadTrack ? <TrackPreview load={loadTrack} language={language} disabled={busy} /> : null;
  if (item.kind === "range") return <label><span>{item.label[language]}: {value}</span><input name={item.id} type="range" min={item.min} max={item.max} step={item.step} value={value} onChange={(event) => onValue(event.target.value)} /></label>;
  if (item.kind === "select") return <label><span>{item.label[language]}</span><select name={item.id} value={value} onChange={(event) => onValue(event.target.value)}>{item.options?.map((option) => <option key={option.value} value={option.value}>{option.label[language]}</option>)}</select></label>;
  if (item.kind === "action") return <button type="button" disabled={busy} onClick={onAction}>{item.label[language]}</button>;
  if (item.kind === "choice") return <><label><span>{item.label[language]}</span><input value={value} onChange={(event) => onValue(event.target.value)} /></label><div className="button-row"><button type="button" disabled={busy} onClick={onLoadChoices}>{language === "zh" ? "扫描" : "Scan"}</button><button className="secondary" type="button" disabled={busy || !value} onClick={onSubmitChoice}>{language === "zh" ? "绑定" : "Bind"}</button></div><CandidateList candidates={candidates} emptyLabel={language === "zh" ? "暂无候选设备" : "No devices found"} onPick={onValue} /></>;
  return null;
}

function validSection(section: unknown): section is ManifestSection {
  if (!section || typeof section !== "object") return false;
  const value = section as Partial<ManifestSection>;
  return typeof value.id === "string" && !!value.label && typeof value.label.zh === "string" && typeof value.label.en === "string" && Array.isArray(value.items) && value.items.every((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<ManifestItem>;
    return typeof candidate.id === "string" && ["range", "select", "action", "choice", "upload", "map"].includes(String(candidate.kind)) && !!candidate.label && typeof candidate.label.zh === "string" && typeof candidate.label.en === "string";
  });
}

function DashboardIcon({ name, size = 24 }: { name: string; size?: number }) {
  return <span className="dashboard-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dashboardIcon(name, size) }} />;
}

function TabButton({ active, icon, label, tab, onClick }: { active: boolean; icon: string; label: string; tab: Tab; onClick: () => void }) {
  return (
    <button className={active ? "tab sel" : "tab"} data-tab={tab} aria-label={label} aria-current={active ? "page" : undefined} type="button" onClick={onClick}>
      <span className="pill"><DashboardIcon name={icon} size={22} /></span><span className="tab-label">{label}</span>
    </button>
  );
}

function normalizeBaseUrl(value: string) {
  return (value.trim() || "http://192.168.4.1").replace(/\/$/, "");
}

function formatMillivolts(value: number | null | undefined) {
  return Number.isFinite(value) ? `${((value as number) / 1000).toFixed(2)} V` : "--";
}

function formatDeciAmps(value: number | null | undefined) {
  return Number.isFinite(value) ? `${((value as number) / 10).toFixed(1)} A` : "--";
}

function formatBmsCapacityEstimate(status: Status, t: (key: keyof typeof I18N.zh) => string) {
  if (status.bms_capacity_estimate_state === "ready" && Number.isFinite(status.bms_capacity_estimate_mah)) {
    return `${((status.bms_capacity_estimate_mah as number) / 1000).toFixed(1)} Ah`;
  }
  if (!status.bms_capacity_estimate_state) return "--";
  return status.bms_capacity_estimate_state === "unsupported" ? t("capacityUnsupported") : t("capacityEstimating");
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
