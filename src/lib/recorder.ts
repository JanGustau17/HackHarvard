export type RecorderHandle = {
  start: () => Promise<void>;
  stop: () => void;
  isRecording: () => boolean;
};

/**
 * Creates a MediaRecorder that collects small chunks and calls onChunk(blob)
 * every `uploadMs` (defaults to 15s). Works in Chrome/Edge; Safari may produce .wav via polyfills.
 */
export function createChunkRecorder(
  onChunk: (blob: Blob) => Promise<void> | void,
  opts: { timesliceMs?: number; uploadMs?: number; mimeTypes?: string[] } = {}
): RecorderHandle {
  let media: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let buf: Blob[] = [];
  let timer: number | null = null;
  let recording = false;

  const timesliceMs = opts.timesliceMs ?? 2000; // request blobs every 2s
  const uploadMs = opts.uploadMs ?? 15000;      // upload every 15s
  const mimeTypes = opts.mimeTypes ?? [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus"
  ];

  function pickType(): string | undefined {
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) return mt;
    }
    return undefined;
  }

  async function start() {
    if (recording) return;
    media = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mt = pickType();
    rec = new MediaRecorder(media, mt ? { mimeType: mt } : undefined);
    buf = [];

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) buf.push(e.data);
    };

    rec.start(timesliceMs);
    recording = true;

    const tick = async () => {
      if (!buf.length) return;
      const blob = new Blob(buf, { type: mt || "audio/webm" });
      buf = [];
      try { await onChunk(blob); } catch (e) { console.error("upload chunk failed", e); }
    };

    timer = window.setInterval(tick, uploadMs) as unknown as number;
  }

  function stop() {
    if (!recording) return;
    recording = false;
    if (timer) { clearInterval(timer); timer = null; }
    try { rec?.stop(); } catch {}
    rec = null;
    media?.getTracks().forEach(t => t.stop());
    media = null;
  }

  return { start, stop, isRecording: () => recording };
}
