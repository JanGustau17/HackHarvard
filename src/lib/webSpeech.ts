// src/lib/startWebSpeech.ts
type Rec = SpeechRecognition & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (ev: SpeechRecognitionEvent) => void;
  onerror: (ev: any) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

function storeTranscript(boardId: string, text: string, confidence?: number) {
  const key = `transcripts_${boardId}`;
  let arr: any[] = [];
  try {
    const raw = localStorage.getItem(key);
    arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) arr = [];
  } catch {
    arr = [];
  }

  arr.push({
    id: (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    text: text || "",
    lang: "en",
    words: [],
    confidence: typeof confidence === "number" ? confidence : null,
    ts: Date.now(),
  });

  localStorage.setItem(key, JSON.stringify(arr));
  window.dispatchEvent(new CustomEvent("transcripts_updated", { detail: { boardId } }));
}

/**
 * Start Web Speech recognition (Chrome recommended).
 * Persists *final* results to localStorage (transcripts_<boardId>).
 * Returns a function you can call to stop recording.
 */
export function startWebSpeech(boardId: string) {
  const w = window as any;
  const SR: typeof window.SpeechRecognition =
    w.webkitSpeechRecognition || w.SpeechRecognition;
  if (!SR) throw new Error("Web Speech API not supported. Use Chrome.");

  const rec: Rec = new (SR as any)();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (ev: SpeechRecognitionEvent) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) {
        const alt = r[0];
        storeTranscript(boardId, alt.transcript || "", alt.confidence);
      }
    }
  };

  rec.onerror = (e) => console.warn("speech error", e);

  // If you want auto-restart behavior, uncomment:
  // rec.onend = () => {
  //   try { rec.start(); } catch {}
  // };

  rec.onend = () => {};

  rec.start();
  return () => rec.stop();
}
