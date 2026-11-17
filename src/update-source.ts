export type UpdateSource = "cf" | "github";
export const updateSources: UpdateSource[] = ["cf", "github"];
export const sourceLabel = (source: UpdateSource) => source === "cf" ? "Cloudflare" : "GitHub";
export const updateBases: Record<UpdateSource, string> = {
  cf: (window.BmsNative ? "https://fuckbms.com/" : import.meta.env.VITE_UPDATE_BASE_URL || new URL("./", document.baseURI).href).replace(/\/?$/, "/"),
  github: "https://raw.githubusercontent.com/wintsa123/espBmsSetting/updates/",
};
export const updateUrl = (path: string, source: UpdateSource = "cf") => new URL(path, updateBases[source]).href;

// Legacy catalog paths must stay inside the selected mirror's repository prefix.
export function releaseUrl(value: string, manifestUrl: string): string {
  const url = new URL(value.startsWith("/") && !value.startsWith("//") ? `..${value}` : value, manifestUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("无效的下载地址 / Invalid download URL");
  return url.href;
}
export type ApkRelease = { versionCode: number; versionName: string; url: string; note?: string };
export function parseApkRelease(value: unknown, manifestUrl: string): ApkRelease {
  if (!value || typeof value !== "object") throw new Error("无效的 App 更新清单 / Invalid App manifest");
  const item = value as Record<string, unknown>;
  if (!Number.isSafeInteger(item.versionCode) || (item.versionCode as number) <= 0 || typeof item.versionName !== "string" || !item.versionName || typeof item.url !== "string" || !item.url) throw new Error("无效的 App 更新清单 / Invalid App manifest");
  return { versionCode: item.versionCode as number, versionName: item.versionName, url: releaseUrl(item.url, manifestUrl), note: typeof item.note === "string" ? item.note : undefined };
}
