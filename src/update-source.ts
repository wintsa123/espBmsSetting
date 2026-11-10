// One public endpoint for the existing APK and firmware catalogs; release hosts are configurable at build time.
function nativeUpdateBase(): string {
  try {
    const info = JSON.parse(window.BmsNative?.getAppInfo?.() || "{}");
    if (typeof info.updateBaseUrl === "string" && info.updateBaseUrl.startsWith("https://")) return info.updateBaseUrl;
  } catch { /* Older shells use the original update server. */ }
  return "https://esp-bms-setting.vercel.app/";
}
export const updateBase = (window.BmsNative ? nativeUpdateBase() : import.meta.env.VITE_UPDATE_BASE_URL || new URL("./", document.baseURI).href).replace(/\/?$/, "/");
export const updateUrl = (path: string) => new URL(path, updateBase).href;

export type ApkRelease = { versionCode: number; versionName: string; url: string; note?: string };
export function parseApkRelease(value: unknown, manifestUrl: string): ApkRelease {
  if (!value || typeof value !== "object") throw new Error("无效的 App 更新清单 / Invalid App manifest");
  const item = value as Record<string, unknown>;
  if (!Number.isSafeInteger(item.versionCode) || (item.versionCode as number) <= 0 || typeof item.versionName !== "string" || !item.versionName || typeof item.url !== "string" || !item.url) throw new Error("无效的 App 更新清单 / Invalid App manifest");
  const url = new URL(item.url, manifestUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("无效的下载地址 / Invalid download URL");
  return { versionCode: item.versionCode as number, versionName: item.versionName, url: url.href, note: typeof item.note === "string" ? item.note : undefined };
}
