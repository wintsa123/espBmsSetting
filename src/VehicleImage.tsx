import { useState } from "react";
import VehicleImageEditor from "./VehicleImageEditor";

const IMAGE_KEY = "bms.dashboard.vehicle-image";
const DEFAULT_IMAGE = "art/ae5.webp";

function savedImage() {
  try {
    const value = localStorage.getItem(IMAGE_KEY);
    return value && value.length < 2_000_000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : DEFAULT_IMAGE;
  } catch { return DEFAULT_IMAGE; }
}

export default function VehicleImage({ language }: { language: "zh" | "en" }) {
  const [src, setSrc] = useState(savedImage);
  const [editing, setEditing] = useState(false);
  const zh = language === "zh";
  const save = (next: string | null) => {
    try {
      if (next === null) localStorage.removeItem(IMAGE_KEY);
      else localStorage.setItem(IMAGE_KEY, next);
    } catch { throw new Error(zh ? "图片保存失败，请检查浏览器存储空间" : "Could not save the image; check browser storage"); }
    setSrc(next || DEFAULT_IMAGE); setEditing(false);
  };
  return <>
    <button className="vehicle-image-button" type="button" aria-label={zh ? "更换车辆图片" : "Change vehicle image"} title={zh ? "编辑车辆图片" : "Edit vehicle image"} onClick={() => setEditing(true)}>
      <img className={`hero-pic hero-in${src === DEFAULT_IMAGE ? " hero-art" : ""}`} src={src} alt={src === DEFAULT_IMAGE ? "AE5" : (zh ? "自定义车辆图片" : "Custom vehicle image")} />
      <span className="vehicle-image-hint">{zh ? "更换图片" : "Change image"}</span>
    </button>
    <VehicleImageEditor open={editing} initialSrc={src} language={language} onSave={save} onClose={() => setEditing(false)} />
  </>;
}
