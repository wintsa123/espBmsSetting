import { ReactNode, useRef, useState } from "react";
import { parseApkRelease, updateUrl, type ApkRelease } from "./update-source";
import { useWebUpdate } from "./web-update";

export function UpdateCard({ title, version, status, checking, onCheck, children }: {
  title: string; version: string; status: string; checking?: boolean; onCheck: () => void; children?: ReactNode;
}) {
  return <section className="card stack settings-detail update-card" aria-label={title}>
    <button className="update-card-check" type="button" onClick={onCheck} disabled={checking} aria-label={`${title} · ${status}`}>
      <span className="update-card-heading"><span className="card-title">{title}</span><span className="card-sub">{version}</span></span>
      <span className="update-card-status" aria-live="polite">{status}<span aria-hidden="true"> ›</span></span>
    </button>
    {children}
  </section>;
}

export default function ClientUpdateCards({ language, appInfo }: { language: "zh" | "en"; appInfo: { versionName?: string; versionCode?: number } }) {
  const zh = language === "zh", native = window.BmsNative;
  const { state: web, check, restart } = useWebUpdate();
  const [apk, setApk] = useState<ApkRelease>();
  const [appState, setAppState] = useState("idle");
  const [appError, setAppError] = useState("");
  const checking = useRef(false);
  const checkApp = async () => {
    if (checking.current) return;
    checking.current = true; setAppState("checking"); setAppError(""); setApk(undefined);
    try {
      const manifestUrl = updateUrl("apk/latest.json");
      const response = await fetch(manifestUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = parseApkRelease(await response.json(), response.url);
      setApk(release);
      setAppState(!native || !appInfo.versionCode ? "available" : release.versionCode > appInfo.versionCode ? "available" : "current");
    } catch (error) { setAppState("error"); setAppError(String(error)); }
    finally { checking.current = false; }
  };
  const status = (value: string) => ({
    idle: zh ? "查找更新" : "Check for updates", checking: zh ? "正在检查…" : "Checking…",
    downloading: zh ? "正在下载…" : "Downloading…", ready: zh ? "已下载，待重启" : "Ready to restart",
    current: zh ? "已是最新版本" : "Up to date", error: zh ? "检查失败，点击重试" : "Failed; tap to retry",
    unconfigured: zh ? "更新源未配置" : "Update source not configured", available: zh ? "可用版本" : "Available version",
  }[value] || (zh ? "查找更新" : "Check for updates"));
  return <>
    <UpdateCard title={zh ? "App 更新" : "App update"} version={native ? `${zh ? "当前版本" : "Current"} ${appInfo.versionName || "—"}` : (zh ? "网页中可查询 App 安装包" : "Check the Android installer from the web")} status={status(appState)} checking={appState === "checking"} onCheck={() => void checkApp()}>
      {appError && <p className="empty" role="status">{appError}</p>}
      {apk && <p className="card-sub">{zh ? "分发版本" : "Published version"} {apk.versionName}{apk.note ? ` · ${apk.note}` : ""}</p>}
      {apk && appState === "available" && (native ? <button className="btn tonal" type="button" onClick={() => native.installAppUpdate ? native.installAppUpdate() : native.openNative("SETTINGS")}>{zh ? "前往下载并安装" : "Download and install"}</button> : <a className="btn tonal app-download" href={apk.url}>{zh ? "下载 App" : "Download App"}</a>)}
    </UpdateCard>
    <UpdateCard title={zh ? "Web 前端更新" : "Web frontend update"} version={`${zh ? "当前资源" : "Current assets"} ${web.currentVersion}`} status={status(web.status)} checking={web.status === "checking" || web.status === "downloading"} onCheck={() => void check()}>
      <p className="card-sub">{zh ? "打开时使用本地资源，并在后台检查下载；下载完成后，下次打开或点击重启生效。" : "Uses local assets and downloads updates in the background. Apply on the next launch or restart here."}</p>
      {web.pendingVersion && <p className="card-sub">{zh ? "待启用版本" : "Ready version"} {web.pendingVersion}</p>}
      {web.error && <p className="empty" role="status">{web.error}</p>}
      {web.status === "unconfigured" && <p className="card-sub">{zh ? "需在 App 中配置已签名的前端更新源后启用。旧版 App 请先升级安装包。" : "Configure a signed frontend source in the app. Older apps require an installer update first."}</p>}
      {(web.status === "ready" || web.pendingVersion) && <button className="btn" type="button" onClick={restart}>{zh ? "重启并应用更新" : "Restart and apply update"}</button>}
    </UpdateCard>
  </>;
}
