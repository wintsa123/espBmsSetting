import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import DashboardSheet from "./DashboardSheet";
import { clampCrop, cropGeometry, CROP_WIDTH, CROP_HEIGHT, type Crop } from "./vehicle-image-crop";
import "./VehicleImageEditor.css";

const DEFAULT_IMAGE = "art/ae5.webp";
const PRESETS = [
  { src: DEFAULT_IMAGE, zh: "AE5 默认", en: "Default AE5" },
  { src: "art/presets/city.svg", zh: "城市踏板", en: "City scooter" },
  { src: "art/presets/sport.svg", zh: "运动踏板", en: "Sport scooter" },
  { src: "art/presets/retro.svg", zh: "复古踏板", en: "Retro scooter" },
  { src: "art/presets/commuter.svg", zh: "轻便电摩", en: "Light electric moped" },
];
const CENTER: Crop = { x: 0, y: 0, zoom: 1 };

export default function VehicleImageEditor({ open, initialSrc, language, onSave, onClose }: {
  open: boolean; initialSrc: string; language: "zh" | "en"; onSave: (src: string | null) => void; onClose: () => void;
}) {
  const zh = language === "zh";
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [source, setSource] = useState(initialSrc);
  const [crop, setCrop] = useState<Crop>(CENTER);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: number; clientX: number; clientY: number; crop: Crop; width: number; height: number } | undefined>(undefined);

  async function selectSource(src: string) {
    const token = ++generation.current;
    setLoading(true); setError("");
    try {
      const decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(zh ? "图片损坏或格式不受支持" : "The image is damaged or unsupported"));
        img.src = src;
      });
      if (token !== generation.current) return;
      if (!decoded.naturalWidth || !decoded.naturalHeight || decoded.naturalWidth * decoded.naturalHeight > 40_000_000) {
        throw new Error(zh ? "图片尺寸过大，请选择较小的图片" : "Choose a smaller image");
      }
      drag.current = undefined;
      setImage(decoded); setSource(src); setCrop(CENTER);
    } catch (reason) { if (token === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (token === generation.current) setLoading(false); }
  }

  useEffect(() => { if (open) void selectSource(initialSrc); return () => { ++generation.current; drag.current = undefined; }; }, [open, initialSrc]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const token = ++generation.current;
    setLoading(true); setError("");
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
      if (token === generation.current) await selectSource(encoded);
    } catch (reason) { if (token === generation.current) { setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false); } }
  }

  const move = (next: Crop) => { if (image) setCrop(clampCrop(image.naturalWidth, image.naturalHeight, next)); };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || loading || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus();
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, crop, width: bounds.width, height: bounds.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    move({ ...start.crop, x: start.crop.x + (event.clientX - start.clientX) / start.width, y: start.crop.y + (event.clientY - start.clientY) / start.height });
  };
  const save = () => {
    if (!image || loading) return;
    try {
      if (source === DEFAULT_IMAGE && crop.x === 0 && crop.y === 0 && crop.zoom === 1) { onSave(null); return; }
      const canvas = document.createElement("canvas");
      canvas.width = CROP_WIDTH; canvas.height = CROP_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error(zh ? "当前设备无法处理图片" : "Image processing is unavailable");
      const rect = cropGeometry(image.naturalWidth, image.naturalHeight, crop);
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      const next = canvas.toDataURL("image/webp", 0.9);
      if (!/^data:image\/(webp|png);base64,/.test(next) || next.length >= 2_000_000) throw new Error(zh ? "图片过大，请选择较小的图片" : "Choose a smaller image");
      onSave(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : (zh ? "图片保存失败" : "Could not save the image")); }
  };
  const rect = image ? cropGeometry(image.naturalWidth, image.naturalHeight, crop) : null;

  return <DashboardSheet open={open} title={zh ? "车辆图片" : "Vehicle image"} closeLabel={zh ? "取消" : "Cancel"} onClose={onClose}>
    <div className="vehicle-image-editor">
      <p className="card-sub">{zh ? "选图后拖拽调整位置，缩放裁剪，确定后保存。" : "Choose an image, drag to position, and zoom to crop. Confirm to save."}</p>
      <div className="vehicle-crop-stage" role="group" aria-label={zh ? "拖拽裁剪车辆图片，方向键可微调" : "Drag to crop vehicle image; arrow keys adjust position"} tabIndex={0} aria-busy={loading} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }} onLostPointerCapture={() => { drag.current = undefined; }} onKeyDown={event => {
        const offsets: Record<string, [number, number]> = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] };
        if (offsets[event.key]) { event.preventDefault(); const [x, y] = offsets[event.key]; move({ ...crop, x: crop.x + x, y: crop.y + y }); }
      }}>
        {image && rect && <img src={source} alt={zh ? "裁剪预览" : "Crop preview"} draggable={false} style={{ left: `${rect.x / CROP_WIDTH * 100}%`, top: `${rect.y / CROP_HEIGHT * 100}%`, width: `${rect.width / CROP_WIDTH * 100}%`, height: `${rect.height / CROP_HEIGHT * 100}%` }} />}
        <span className="vehicle-crop-grid" aria-hidden="true" />
        {loading && <span className="vehicle-crop-loading">{zh ? "正在读取图片…" : "Loading image…"}</span>}
      </div>
      <label className="vehicle-zoom"><span>{zh ? "缩放" : "Zoom"}<b className="tnum">{Math.round(crop.zoom * 100)}%</b></span><input type="range" min="1" max="4" step="0.01" value={crop.zoom} aria-label={zh ? "缩放" : "Zoom"} disabled={!image || loading} onChange={event => move({ ...crop, zoom: Number(event.target.value) })} /></label>
      <div className="vehicle-editor-actions"><button className="btn tonal" type="button" disabled={loading} onClick={() => input.current?.click()}>{zh ? "选图" : "Choose image"}</button><button className="btn text" type="button" disabled={loading} onClick={() => void selectSource(DEFAULT_IMAGE)}>{zh ? "恢复默认" : "Restore default"}</button></div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" aria-label={zh ? "上传车辆图片" : "Upload vehicle image"} hidden onChange={event => void upload(event)} />
      <h2>{zh ? "预置图片" : "Preset images"}</h2>
      <div className="vehicle-presets">{PRESETS.map(preset => <button className={`vehicle-preset${source === preset.src ? " sel" : ""}`} type="button" key={preset.src} disabled={loading} aria-label={`${zh ? "预置车辆：" : "Preset vehicle: "}${zh ? preset.zh : preset.en}`} aria-pressed={source === preset.src} onClick={() => void selectSource(preset.src)}><img src={preset.src} alt="" /><span>{zh ? preset.zh : preset.en}</span></button>)}</div>
      {error && <p className="vehicle-editor-error" role="alert">{error}</p>}
      <footer className="vehicle-editor-footer"><button className="btn text" type="button" onClick={onClose}>{zh ? "取消" : "Cancel"}</button><button className="btn" type="button" disabled={!image || loading} onClick={save}>{zh ? "确定" : "Confirm"}</button></footer>
    </div>
  </DashboardSheet>;
}
