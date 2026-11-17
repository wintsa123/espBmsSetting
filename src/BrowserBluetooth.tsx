import { useEffect, useRef, useState } from "react";

export default function BrowserBluetooth({ language, onNotify }: { language: "zh" | "en"; onNotify: (message: string) => void }) {
  const zh = language === "zh";
  const [device, setDevice] = useState<BluetoothDevice>();
  const [connecting, setConnecting] = useState(false);
  const connection = useRef<BluetoothDevice | undefined>(undefined);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; connection.current?.gatt?.disconnect(); }, []);
  async function connect() {
    const current = ++generation.current;
    setConnecting(true);
    let chosen: BluetoothDevice | undefined;
    try {
      if (!window.isSecureContext) throw new Error(zh ? "请通过 HTTPS 或 localhost 打开页面，再使用本机蓝牙" : "Open this page over HTTPS or localhost to use Bluetooth");
      if (!navigator.bluetooth) throw new Error(zh ? "当前浏览器不支持蓝牙，请使用支持 Web Bluetooth 的 Chrome 或 Edge" : "Use a browser with Web Bluetooth, such as Chrome or Edge");
      chosen = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      if (generation.current !== current) return;
      if (!chosen.gatt) throw new Error(zh ? "该设备不支持 BLE 连接" : "This device does not support BLE connections");
      connection.current?.gatt?.disconnect();
      setDevice(undefined);
      connection.current = chosen;
      await chosen.gatt.connect();
      if (generation.current !== current) { chosen.gatt.disconnect(); return; }
      const active = chosen;
      active.addEventListener("gattserverdisconnected", () => {
        if (connection.current !== active) return;
        connection.current = undefined; setDevice(undefined);
        onNotify(zh ? "本机蓝牙连接已断开" : "Local Bluetooth disconnected");
      }, { once: true });
      setDevice(active);
      onNotify(zh ? `已连接 ${active.name || "蓝牙设备"}` : `Connected to ${active.name || "Bluetooth device"}`);
    } catch (error) {
      chosen?.gatt?.disconnect();
      if (connection.current === chosen) connection.current = undefined;
      if (generation.current === current) onNotify(error instanceof DOMException && error.name === "NotFoundError" ? (zh ? "已取消设备选择" : "Device selection canceled") : error instanceof Error ? error.message : String(error));
    } finally { if (generation.current === current) setConnecting(false); }
  }
  return <div className="control-item browser-bluetooth">
    <p className="empty">{zh ? "使用当前电脑的蓝牙连接附近 BLE 设备。此连接独立于 ESP 的扫描绑定。" : "Connect to nearby BLE devices using this computer. This connection is separate from ESP binding."}</p>
    {device && <div className="bluetooth-device"><span className="feature-icon" aria-hidden="true">↯</span><span><strong>{device.name || (zh ? "蓝牙设备" : "Bluetooth device")}</strong><small>{zh ? "本机已连接" : "Connected locally"}</small></span></div>}
    <button type="button" className="btn tonal" disabled={connecting} onClick={() => void connect()}>{connecting ? (zh ? "正在连接…" : "Connecting…") : (zh ? "选择电脑蓝牙设备" : "Choose a Bluetooth device")}</button>
    {device && <button type="button" className="btn tonal" onClick={() => { generation.current++; connection.current?.gatt?.disconnect(); connection.current = undefined; setDevice(undefined); setConnecting(false); }}>{zh ? "断开本机连接" : "Disconnect local device"}</button>}
  </div>;
}
