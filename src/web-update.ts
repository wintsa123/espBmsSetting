import { useEffect, useState } from "react";

export type WebUpdateState = {
  currentVersion: string; pendingVersion?: string; status: "idle" | "checking" | "downloading" | "ready" | "current" | "error" | "unconfigured";
  error?: string;
};
const local: WebUpdateState = { currentVersion: __WEB_VERSION__, status: "idle" };
let registration: ServiceWorkerRegistration | undefined;
let boot: Promise<ServiceWorkerRegistration> | undefined;

async function registerWeb(): Promise<ServiceWorkerRegistration> {
  if (!isSecureContext || !("serviceWorker" in navigator)) throw new Error("当前环境不支持离线更新 / Offline updates unavailable");
  boot ??= navigator.serviceWorker.register(new URL("./sw.js", document.baseURI), { updateViaCache: "none", scope: "./" }).catch(error => { boot = undefined; throw error; });
  return registration = await boot;
}

function nativeState(): WebUpdateState {
  try {
    const value = JSON.parse(window.BmsNative?.getWebUpdateState?.() || "{}");
    return { currentVersion: value.currentVersion || __WEB_VERSION__, pendingVersion: value.pendingVersion,
      status: value.status || "unconfigured", error: value.error };
  } catch { return { ...local, status: "error", error: "无法读取资源更新状态 / Cannot read update state" }; }
}

export function useWebUpdate() {
  const native = window.BmsNative;
  const [state, setState] = useState<WebUpdateState>(() => native ? nativeState() : local);
  const check = async () => {
    if (native) {
      if (!native.checkWebUpdate) { setState({ ...local, status: "unconfigured" }); return; }
      native.checkWebUpdate(); setState(nativeState()); return;
    }
    setState(previous => ({ ...previous, status: "checking", error: undefined }));
    try {
      const reg = await registerWeb();
      await reg.update();
      const worker = reg.installing;
      if (worker) {
        setState(previous => ({ ...previous, status: "downloading" }));
        await new Promise<void>((resolve, reject) => {
          const changed = () => {
            if (worker.state === "redundant") { worker.removeEventListener("statechange", changed); reject(new Error("前端资源下载失败 / Resource download failed")); }
            else if (worker.state === "installed" || worker.state === "activated") { worker.removeEventListener("statechange", changed); resolve(); }
          };
          worker.addEventListener("statechange", changed);
          changed();
        });
      }
      setState(previous => ({ ...previous, status: reg.waiting ? "ready" : "current" }));
    } catch (error) { setState(previous => ({ ...previous, status: "error", error: String(error) })); }
  };
  useEffect(() => {
    if (native) {
      const timer = window.setInterval(() => setState(nativeState()), 1000);
      return () => window.clearInterval(timer);
    }
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const fail = (error: unknown) => { if (!disposed) setState(previous => ({ ...previous, status: "error", error: String(error) })); };
    registerWeb().then(async reg => {
      if (disposed) return;
      const watch = () => {
        const worker = reg.installing;
        if (!worker) return;
        setState(previous => ({ ...previous, status: "downloading", error: undefined }));
        const changed = () => {
          if (disposed) return;
          if (worker.state === "installed") setState(previous => ({ ...previous, status: reg.waiting ? "ready" : "current" }));
          if (worker.state === "redundant") fail("前端资源下载失败，继续使用当前版本 / Download failed; current version retained");
        };
        worker.addEventListener("statechange", changed);
        cleanups.push(() => worker.removeEventListener("statechange", changed));
      };
      reg.addEventListener("updatefound", watch);
      cleanups.push(() => reg.removeEventListener("updatefound", watch));
      if (reg.installing) watch();
      await reg.update();
      if (!disposed && !reg.installing) setState(previous => ({ ...previous, status: reg.waiting ? "ready" : "current" }));
    }).catch(fail);
    return () => { disposed = true; cleanups.forEach(clean => clean()); };
  }, [native]);
  const restart = () => {
    if (native) { native.restartWeb?.(); return; }
    if (!registration?.waiting) return;
    const reload = () => { navigator.serviceWorker.removeEventListener("controllerchange", reload); window.location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  };
  return { state, check, restart };
}
