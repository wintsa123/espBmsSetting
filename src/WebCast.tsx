import { useEffect, useRef, useState } from "react";
import { startPanelStream, streamError, type DeviceRequest } from "./panel-stream";

export default function WebCast({ zh, origin, request, appLink }: {
  zh: boolean; origin: string; request: DeviceRequest; appLink: string;
}) {
  const [state, setState] = useState<"idle" | "starting" | "active">("idle");
  const [message, setMessage] = useState("");
  const session = useRef<AbortController | undefined>(undefined);
  const preview = useRef<HTMLVideoElement>(null);
  const native = window.BmsNative;
  const nativeCast = !!(native?.startCast && native.stopCast && native.getCastState);
  const supported = nativeCast || typeof navigator.mediaDevices?.getDisplayMedia === "function";
  useEffect(() => {
    if (!nativeCast) return () => session.current?.abort();
    const update = () => {
      try {
        const value = JSON.parse(native!.getCastState!());
        const next = value.state === "streaming" ? "active" : ["starting", "connecting", "retrying"].includes(value.state) ? "starting" : "idle";
        setState(next);
        setMessage(value.detail || (value.state === "failed" ? (zh ? "投屏失败，请检查面板连接后重试。" : "Casting failed. Check the panel connection and retry.") : ""));
        if (next !== "starting") session.current = undefined;
      } catch { setState("idle"); setMessage(zh ? "无法读取投屏状态，请重试。" : "Cannot read casting status. Retry."); }
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => { window.clearInterval(timer); if (session.current) native!.stopCast!(); };
  }, [native, nativeCast, zh]);

  function stop(text = "") {
    if (nativeCast) native!.stopCast!();
    session.current?.abort();
    session.current = undefined;
    setState("idle");
    setMessage(text);
  }

  async function start() {
    if (!supported || session.current) return;
    const controller = new AbortController();
    session.current = controller;
    setState("starting");
    setMessage("");
    if (nativeCast) {
      try { native!.startCast!(origin); }
      catch (error) { stop(error instanceof Error ? error.message : String(error)); }
      return;
    }
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 10, max: 20 } }, audio: false });
      const release = () => {
        for (const track of media.getTracks()) track.stop();
        if (preview.current?.srcObject === media) preview.current.srcObject = null;
      };
      if (controller.signal.aborted) { release(); return; }
      controller.signal.addEventListener("abort", release, { once: true });
      const video = preview.current!;
      const track = media.getVideoTracks()[0];
      if (!track) throw new Error("No video track");
      track.addEventListener("ended", () => stop(zh ? "屏幕共享已结束。" : "Screen sharing ended."), { once: true, signal: controller.signal });
      video.srcObject = media;
      await video.play();
      if (controller.signal.aborted) return;
      startPanelStream({ origin, request, signal: controller.signal, interval: 80, landscape: video.videoWidth >= video.videoHeight,
        draw(context) {
          const { width, height } = context.canvas;
          if (video.readyState < 2 || !video.videoWidth) return false;
          const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
          const w = video.videoWidth * scale, h = video.videoHeight * scale;
          context.fillStyle = "#000";
          context.fillRect(0, 0, width, height);
          context.drawImage(video, (width - w) / 2, (height - h) / 2, w, h);
          return true;
        },
        onActive: () => setState("active"),
        onEnd: error => stop(error ? streamError(error, zh) : (zh ? "面板已结束投屏。" : "The panel ended casting.")),
      });
    } catch {
      if (!controller.signal.aborted) stop(zh ? "屏幕共享已取消或无法开启。" : "Screen sharing was cancelled or could not start.");
    }
  }

  return <div className="stack web-feature">
    <p className="card-sub">{nativeCast ? (zh ? "连接面板热点后，开始投屏并授予屏幕录制权限，再切换到需要共享的应用。" : "Join the panel hotspot, allow screen capture, then switch to the app you want to share.") : (zh ? "连接面板热点后，选择要共享的屏幕、窗口或浏览器标签页。" : "Join the panel hotspot and choose a screen, window, or browser tab to share.")}</p>
    {!supported && <p className="empty" role="status">{zh ? "当前浏览器没有屏幕共享功能。可使用桌面版 Chrome 或 Edge 的 HTTPS 页面，或打开 Android App 投屏。" : "Screen sharing is unavailable here. Use desktop Chrome or Edge over HTTPS, or cast with the Android app."}</p>}
    <video ref={preview} muted playsInline hidden={nativeCast || state !== "active"} />
    {state === "idle" ? <button type="button" className="btn" onClick={() => void start()} disabled={!supported}>{nativeCast ? (zh ? "开始投屏" : "Start casting") : (zh ? "开始网页投屏" : "Start browser casting")}</button>
      : <button type="button" className="btn tonal" onClick={() => stop()}>{zh ? "结束投屏" : "Stop casting"}</button>}
    <p className="card-sub" role="status" hidden={state === "idle" && !message}>{state === "starting" ? (zh ? "等待屏幕授权和面板连接…" : "Waiting for screen permission and the panel…") : state === "active" ? (zh ? "正在向面板投屏" : "Casting to the panel") : message}</p>
    {!native && state === "idle" && <a className="btn tonal web-feature-app" href={appLink}>{zh ? "打开 Android 投屏" : "Open Android casting"}</a>}
    {!supported && <a className="web-feature-app" href="/apk/两轮智控.apk" download>{zh ? "下载 Android App" : "Download the Android app"}</a>}
  </div>;
}
