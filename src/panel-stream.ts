export type DeviceRequest = (path: string, options?: RequestInit) => Promise<unknown>;

type Orientation = { rotation: number; width: number; height: number };

export function jpegPacket(sequence: number, rotation: number, jpeg: ArrayBuffer) {
  const header = new DataView(new ArrayBuffer(7));
  header.setUint8(0, 1);
  header.setUint8(1, 4);
  header.setUint32(2, sequence);
  header.setUint8(6, rotation);
  return new Blob([header.buffer, jpeg]);
}

export function startPanelStream({ origin, request, signal, landscape, draw, interval, onActive, onEnd }: {
  origin: string; request: DeviceRequest; signal: AbortSignal; landscape: boolean; interval: number;
  draw: (canvas: CanvasRenderingContext2D) => boolean; onActive: () => void; onEnd: (error?: unknown) => void;
}) {
  const abort = new AbortController();
  const timeout = AbortSignal.timeout(8000);
  const startup = AbortSignal.any([signal, abort.signal, timeout]);
  let socket: WebSocket | undefined;
  let timer = 0;
  let deadline = 0;
  let ended = false;
  const finish = (error?: unknown) => {
    if (ended) return;
    ended = true;
    abort.abort();
    clearTimeout(timer);
    clearTimeout(deadline);
    signal.removeEventListener("abort", stop);
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    if (!signal.aborted) onEnd(error);
  };
  const stop = () => finish();
  signal.addEventListener("abort", stop, { once: true });

  void (async () => {
    startup.throwIfAborted();
    const info = await request("/api/cast/info", { signal: startup }) as { protocol_version?: number; max_frame_bytes?: number; active?: boolean; orientations?: Orientation[] };
    startup.throwIfAborted();
    const orientation = Array.isArray(info.orientations) && info.orientations.find(item => item?.rotation === (landscape ? 1 : 0));
    if (info.protocol_version !== 4 || !orientation ||
        ![orientation.width, orientation.height].every(value => Number.isInteger(value) && value > 0 && value <= 1024) ||
        !Number.isInteger(info.max_frame_bytes) || info.max_frame_bytes! <= 0) throw new Error("cast-protocol");
    if (info.active) throw new Error("cast-busy");
    const maxBytes = Math.min(262144, info.max_frame_bytes!);
    const canvas = document.createElement("canvas");
    canvas.width = orientation.width;
    canvas.height = orientation.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("cast-encode");
    const url = new URL("/cast", origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("cast-connect");
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const link = socket = new WebSocket(url);
    link.binaryType = "arraybuffer";
    let sequence = 0;
    let awaiting = false;
    let active = false;
    const failAfter = (ms: number, code: string) => {
      clearTimeout(deadline);
      deadline = window.setTimeout(() => finish(new Error(code)), ms);
    };
    const send = async () => {
      if (ended) return;
      try {
        if (!draw(context)) {
          link.send(new Uint8Array([4]));
          timer = window.setTimeout(() => void send(), interval);
          return;
        }
        failAfter(4000, "cast-timeout");
        const image = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
        if (!image || image.size > maxBytes) throw new Error("cast-encode");
        const jpeg = await image.arrayBuffer();
        if (ended) return;
        sequence = (sequence + 1) >>> 0;
        awaiting = true;
        link.send(jpegPacket(sequence, orientation.rotation, jpeg));
      } catch (error) { finish(error); }
    };
    failAfter(8000, "cast-connect");
    link.onopen = () => { clearTimeout(deadline); void send(); };
    link.onmessage = ({ data }) => {
      if (!(data instanceof ArrayBuffer)) return;
      const packet = new DataView(data);
      if (packet.byteLength === 2 && packet.getUint8(0) === 3 && packet.getUint8(1) === 4) finish();
      if (!awaiting || packet.byteLength !== 5 || packet.getUint8(0) !== 0x81 || packet.getUint32(1) !== sequence) return;
      awaiting = false;
      clearTimeout(deadline);
      if (!active) { active = true; onActive(); }
      timer = window.setTimeout(() => void send(), interval);
    };
    link.onerror = () => finish(new Error("cast-connect"));
    link.onclose = () => finish(new Error("cast-disconnected"));
  })().catch(finish);
}

export function streamError(error: unknown, zh: boolean) {
  switch (error instanceof Error ? error.message : "") {
    case "cast-busy": return zh ? "面板正在投屏，请先结束当前会话。" : "The panel is busy casting. End that session first.";
    case "cast-protocol": return zh ? "面板固件不支持当前投屏协议。" : "The panel firmware does not support this casting protocol.";
    case "cast-encode": return zh ? "画面编码失败。" : "Could not encode the frame.";
    case "cast-timeout":
    case "cast-disconnected": return zh ? "面板连接已中断，请检查 Wi-Fi 后重试。" : "The panel disconnected. Check Wi-Fi and retry.";
    default: return zh ? "连接面板失败。请检查热点、局域网访问权限和固件投屏模块。" : "Could not reach the panel. Check Wi-Fi, local network permission, and casting firmware.";
  }
}
