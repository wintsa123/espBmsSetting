import { ChangeEvent, useRef, useState } from "react";

const IMAGE_KEY = "bms.dashboard.vehicle-image";
const DEFAULT_IMAGE = "art/ae5.webp";

function savedImage() {
  try {
    const value = localStorage.getItem(IMAGE_KEY);
    return value && value.length < 2_000_000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : DEFAULT_IMAGE;
  } catch { return DEFAULT_IMAGE; }
}

export default function VehicleImage({ language }: { language: "zh" | "en" }) {
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(savedImage);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const zh = language === "zh";

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error(zh ? "请选择 10 MB 以内的 JPG、PNG、WebP、AVIF 或 GIF 图片" : "Choose a JPG, PNG, WebP, AVIF or GIF image under 10 MB");
      }
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(zh ? "图片读取失败，请重试" : "Could not read the image"));
        reader.readAsDataURL(file);
      });
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(zh ? "图片损坏或格式不受支持" : "The image is damaged or unsupported"));
        img.src = encoded;
      });
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) {
        throw new Error(zh ? "图片尺寸过大，请选择较小的图片" : "Choose a smaller image");
      }
      const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error(zh ? "当前设备无法处理图片" : "Image processing is unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const next = canvas.toDataURL("image/webp", 0.9);
      if (next.length >= 2_000_000) throw new Error(zh ? "图片过大，请选择较小的图片" : "Choose a smaller image");
      try { localStorage.setItem(IMAGE_KEY, next); }
      catch { throw new Error(zh ? "图片保存失败，请检查浏览器存储空间" : "Could not save the image; check browser storage"); }
      setSrc(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (zh ? "图片上传失败，请重试" : "Could not upload the image"));
    } finally { setLoading(false); }
  }

  return <>
    <button className="vehicle-image-button" type="button" aria-label={zh ? "更换车辆图片" : "Change vehicle image"} title={zh ? "点击上传车辆图片" : "Upload a vehicle image"} disabled={loading} onClick={() => input.current?.click()}>
      <img className={`hero-pic hero-in${src === DEFAULT_IMAGE ? " hero-art" : ""}`} src={src} alt={src === DEFAULT_IMAGE ? "AE5" : (zh ? "自定义车辆图片" : "Custom vehicle image")} />
      <span className="vehicle-image-hint">{loading ? (zh ? "正在保存…" : "Saving…") : (zh ? "更换图片" : "Change image")}</span>
    </button>
    <input ref={input} className="vehicle-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" aria-label={zh ? "上传车辆图片" : "Upload vehicle image"} onChange={event => void upload(event)} hidden />
    {error && <span className="vehicle-image-error" role="alert">{error}</span>}
  </>;
}
