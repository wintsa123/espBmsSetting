/** Shared drawing space for the vehicle image editor preview and exported image. */
export const CROP_WIDTH = 900;
export const CROP_HEIGHT = 600;
export type Crop = { x: number; y: number; zoom: number };

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const dimension = (value: number) => Number.isFinite(value) && value > 0 ? value : 1;

function renderedSize(width: number, height: number, zoom: number) {
  const w = dimension(width), h = dimension(height);
  // Ratios keep even extreme finite dimensions from overflowing the fit calculation.
  return w / h >= CROP_WIDTH / CROP_HEIGHT
    ? { width: CROP_WIDTH * zoom, height: CROP_WIDTH * (h / w) * zoom }
    : { width: CROP_HEIGHT * (w / h) * zoom, height: CROP_HEIGHT * zoom };
}

/** Offsets are fractions of the 900×600 crop frame, independent of preview CSS size. */
export function clampCrop(width: number, height: number, crop: Crop): Crop {
  const zoom = Math.max(1, Math.min(4, finite(crop.zoom, 1)));
  const rendered = renderedSize(width, height, zoom);
  const boundX = ((rendered.width + CROP_WIDTH) / 2 - Math.min(rendered.width, CROP_WIDTH) * 0.25) / CROP_WIDTH;
  const boundY = ((rendered.height + CROP_HEIGHT) / 2 - Math.min(rendered.height, CROP_HEIGHT) * 0.25) / CROP_HEIGHT;
  return {
    x: Math.max(-boundX, Math.min(boundX, finite(crop.x, 0))),
    y: Math.max(-boundY, Math.min(boundY, finite(crop.y, 0))),
    zoom,
  };
}

/** Destination rectangle for drawImage(image, x, y, width, height); base fit is contain. */
export function cropGeometry(width: number, height: number, crop: Crop) {
  const safe = clampCrop(width, height, crop);
  const rendered = renderedSize(width, height, safe.zoom);
  return {
    x: (CROP_WIDTH - rendered.width) / 2 + safe.x * CROP_WIDTH,
    y: (CROP_HEIGHT - rendered.height) / 2 + safe.y * CROP_HEIGHT,
    width: rendered.width,
    height: rendered.height,
  };
}
