import { ReactNode, useEffect, useRef, useState } from "react";
import { parseApkRelease, updateUrl, updateSources, sourceLabel, type ApkRelease, type UpdateSource } from "./update-source";
import { useWebUpdate } from "./web-update";
import DashboardSheet from "./DashboardSheet";

export function UpdateCard({ title, version, status, checking, onCheck, language, source, onSourceChange, badge, children }: {
  title: string; version: string; status: string; checking?: boolean; onCheck: () => void; language: "zh" | "en";
  source: UpdateSource; onSourceChange: (source: UpdateSource) => void; badge: string; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const zh = language === "zh";
  return <>
    <button className="update-row quiet" type="button" aria-label={`${title} · ${zh ? "查看更新" : "View update"}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className="update-badge" aria-hidden="true">{badge}</span>
      <span className="update-summary"><strong>{title}</strong><span>{version}</span><span className="update-summary-status">{checking && <span className="loading-ring" aria-hidden="true" />}{status}</span></span>
      <span className="update-arrow" aria-hidden="true">›</span>
    </button>
    <DashboardSheet open={open} title={title} subtitle={version} closeLabel={zh ? "关闭" : "Close"} onClose={() => setOpen(false)}>
      <div className="stack device-forms update-details">
        <span className="card-sub">{zh ? "下载链路" : "Download source"}</span>
        <div className="update-sources" role="group" aria-label={zh ? "更新链路" : "Update source"}>
          {updateSources.map(value => <button key={value} className={`btn ${source === value ? "" : "tonal"}`} type="button" aria-pressed={source === value} disabled={checking} onClick={() => { if (value !== source) onSourceChange(value); }}>{sourceLabel(value)}</button>)}
        </div>
        <p className="card-sub">{zh ? `通过 ${sourceLabel(source)} 检查并下载；链路不可用时可切换重试。` : `Check and download via ${sourceLabel(source)}. Switch sources if unavailable.`}</p>
        <div className="update-check-row"><p className="update-card-status" role="status" aria-live="polite">{checking && <span className="loading-ring" aria-hidden="true" />}{status}</p><button className="btn tonal update-card-check" type="button" disabled={checking} onClick={onCheck}>{checking ? (zh ? "处理中…" : "Working…") : (zh ? "检查更新" : "Check for updates")}</button></div>
        {children}
        <button className="btn tonal" type="button" onClick={() => setOpen(false)}>{zh ? "返回" : "Back"}</button>
      </div>
    </DashboardSheet>
  </>;
}

export default function ClientUpdateCards({ language, appInfo }: { language: "zh" | "en"; appInfo: { versionName?: string; versionCode?: number } }) {
  const zh = language === "zh", native = window.BmsNative;
  const { state: web, check, restart } = useWebUpdate();
  const [appSource, setAppSource] = useState<UpdateSource>("cf");
  const [webSource, setWebSource] = useState<UpdateSource>("cf");
  const [apk, setApk] = useState<ApkRelease>();
  const [appState, setAppState] = useState("idle");
  const [appError, setAppError] = useState("");
  const checking = useRef(false);
  useEffect(() => {
    if (appState !== "downloading" || !native?.getAppUpdateState) return;
    const timer = window.setInterval(() => {
      try {
        const result = JSON.parse(native.getAppUpdateState!());
        if (result.status === "error") { setAppState("available"); setAppError(result.error || (zh ? "安装失败，请重试" : "Install failed. Retry.")); }
        else if (result.status === "current") setAppState("current");
        else if (result.status === "installing") setAppState("available");
      } catch { setAppState("available"); setAppError(zh ? "无法读取安装状态，请重试" : "Cannot read install status. Retry."); }
    }, 500);
    return () => window.clearInterval(timer);
  }, [appState, native, zh]);
  const checkApp = async () => {
    if (checking.current) return;
    checking.current = true; setAppState("checking"); setAppError(""); setApk(undefined);
    try {
      const manifestUrl = updateUrl("apk/latest.json", appSource);
      const response = await fetch(manifestUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = parseApkRelease(await response.json(), response.url);
      setApk(release);
      setAppState(!native || !appInfo.versionCode ? "available" : release.versionCode > appInfo.versionCode ? "available" : "current");
    } catch (error) { setAppState("error"); setAppError(String(error)); }
    finally { checking.current = false; }
  };
  const status = (value: string) => ({
    idle: zh ? "尚未检查" : "Not checked", checking: zh ? "正在检查…" : "Checking…",
    downloading: zh ? "正在下载…" : "Downloading…", ready: zh ? "已下载，待重启" : "Ready to restart",
    current: zh ? "已是最新版本" : "Up to date", error: zh ? "检查失败，请重试或切换链路" : "Failed; retry or switch source",
    unconfigured: zh ? "请先更新 App 安装包" : "Update the app installer first", available: zh ? "有可用版本" : "Update available",
  }[value] || (zh ? "尚未检查" : "Not checked"));
  return <>
    {native && <UpdateCard badge="APP" source={appSource} onSourceChange={value => { setAppSource(value); setApk(undefined); setAppState("idle"); setAppError(""); }} language={language} title={zh ? "App 更新" : "App update"} version={`${zh ? "当前版本" : "Current"} ${appInfo.versionName || "—"}`} status={status(appState)} checking={appState === "checking" || appState === "downloading"} onCheck={() => void checkApp()}>
      {appError && <p className="empty" role="status">{appError}</p>}
      {apk && <div className="update-release"><strong>{zh ? "分发版本" : "Published version"} {apk.versionName}</strong>{apk.note && <p className="card-sub">{apk.note}</p>}</div>}
      {apk && appState === "available" && (native?.installAppUpdateFrom && native.getAppUpdateState ? <button className="btn" type="button" onClick={() => { setAppError(""); setAppState("downloading"); native.installAppUpdateFrom!(appSource); }}>{zh ? "下载并安装 App" : "Download and install App"}</button> : <a className="btn app-download" href={apk.url}>{zh ? "下载 App" : "Download App"}</a>)}
    </UpdateCard>}
    <UpdateCard badge="WEB" source={webSource} onSourceChange={setWebSource} language={language} title={zh ? "Web 前端更新" : "Web frontend update"} version={`${zh ? "当前资源" : "Current assets"} ${web.currentVersion}`} status={status(web.status)} checking={web.status === "checking" || web.status === "downloading"} onCheck={() => void check(webSource)}>
      <p className="card-sub">{zh ? "后台下载不会中断使用。完整校验后，下次打开或点击重启生效。" : "Background downloads keep the current page running. Verified updates apply on next launch or restart."}</p>
      {web.source && <p className="card-sub">{zh ? "最近检查链路" : "Last checked source"} · {sourceLabel(web.source)}</p>}
      {web.pendingVersion && <p className="update-release">{zh ? "待启用版本" : "Ready version"} {web.pendingVersion}</p>}
      {web.error && <p className="empty" role="status">{web.error}</p>}
      {(web.status === "ready" || web.pendingVersion) && <button className="btn" type="button" onClick={restart}>{zh ? "重启并应用更新" : "Restart and apply update"}</button>}
    </UpdateCard>
  </>;
}
