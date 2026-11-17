import { useEffect, useRef, useState } from "react";
import { updateSources, type UpdateSource } from "./update-source";

export type WebUpdateState = {
  currentVersion: string; pendingVersion?: string; source?: UpdateSource;
  status: "idle" | "checking" | "downloading" | "ready" | "current" | "error" | "unconfigured"; error?: string;
};
const local: WebUpdateState = { currentVersion: __WEB_VERSION__, status: "idle" };
let registration: ServiceWorkerRegistration | undefined;
let boot: Promise<ServiceWorkerRegistration> | undefined;
async function registerWeb(): Promise<ServiceWorkerRegistration> {
  if (!isSecureContext || !("serviceWorker" in navigator)) throw new Error("当前环境不支持离线更新 / Offline updates unavailable");
  boot ??= navigator.serviceWorker.register(new URL("./sw.js", document.baseURI), {updateViaCache:"none",scope:"./"}).then(() => navigator.serviceWorker.ready).catch(error => {boot = undefined; throw error;});
  return registration = await boot;
}
function nativeState(): WebUpdateState {
  try {
    const value = JSON.parse(window.BmsNative?.getWebUpdateState?.() || "{}");
    return { currentVersion: value.currentVersion || __WEB_VERSION__, pendingVersion: value.pendingVersion, source:value.source,
      status: value.status || "unconfigured", error: value.error };
  } catch { return {...local,status:"error",error:"无法读取资源更新状态 / Cannot read update state"}; }
}
async function workerMessage(type: string, source?: UpdateSource): Promise<WebUpdateState> {
  const reg = await registerWeb();
  const worker = reg.active;
  if (!worker) throw new Error("离线资源尚未就绪 / Offline resources not ready");
  return new Promise((resolve,reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {channel.port1.close(); reject(new Error("更新请求超时 / Update timed out"));}, type === "CHECK_UPDATE" ? 180000 : 5000);
    channel.port1.onmessage = event => {window.clearTimeout(timer); channel.port1.close(); resolve(event.data as WebUpdateState);};
    worker.postMessage({type,source,currentVersion:__WEB_VERSION__},[channel.port2]);
  });
}
export function useWebUpdate() {
  const native = window.BmsNative;
  const [state,setState] = useState<WebUpdateState>(() => native ? nativeState() : local);
  const busy = useRef(false);
  const check = async (source?: UpdateSource) => {
    if (busy.current) return;
    if (native) {
      if (source && native.checkWebUpdateFrom) native.checkWebUpdateFrom(source);
      else if (!source || source === "cf") native.checkWebUpdate?.();
      else {setState({...nativeState(),status:"error",error:"此链路需先更新 App / Update App to use this source"}); return;}
      setState(nativeState()); return;
    }
    busy.current = true;
    setState(previous => ({...previous,status:"checking",error:undefined}));
    try {
      for (const value of source ? [source] : updateSources) {
        const next = await workerMessage("CHECK_UPDATE",value); setState(next);
        if (next.status !== "error") break;
      }
    } catch (error) {setState(previous => ({...previous,status:"error",error:String(error)}));}
    finally {busy.current = false;}
  };
  useEffect(() => {
    let disposed = false;
    if (!native) void check();
    const timer = window.setInterval(() => {
      if (native) setState(nativeState());
      else void workerMessage("GET_UPDATE_STATE").then(value => {if (!disposed) setState(value);}).catch(() => {});
    },1000);
    return () => {disposed = true; window.clearInterval(timer);};
  },[native]);
  const restart = async () => {
    if (native) {native.restartWeb?.(); return;}
    try {await workerMessage("ACTIVATE_UPDATE"); window.location.reload();}
    catch (error) {setState(previous => ({...previous,status:"error",error:String(error)}));}
  };
  return {state,check,restart};
}
