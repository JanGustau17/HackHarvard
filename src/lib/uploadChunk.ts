// src/lib/uploadChunk.ts
/** Result returned by /api/transcribe */
export interface TranscribeResult {
  text: string;
  lang?: string;
  words?: any[];
  confidence?: number;
}

/**
 * Sends an audio blob to your STT endpoint (if provided) and stores the
 * resulting transcript in localStorage under `transcripts_<boardId>`.
 *
 * - If `endpoint` is a non-empty string, we'll POST the blob to it and
 *   use the JSON response as { text, lang, words, confidence }.
 * - If `endpoint` is falsy (e.g. ""), we'll skip the network call and
 *   store a placeholder entry (empty text) so the UI flow still works.
 */
export async function sendChunkAndStore(
  boardId: string,
  blob: Blob,
  endpoint: string = "/api/transcribe"
): Promise<TranscribeResult> {
  const storeKey = `transcripts_${boardId}`;

  // Helper: read current transcript array
  const read = (): any[] => {
    try {
      const raw = localStorage.getItem(storeKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  // 1) Optionally call the STT endpoint
  let data: TranscribeResult = { text: "", lang: "en", words: [], confidence: undefined };

  if (endpoint && typeof endpoint === "string") {
    try {
      const fd = new FormData();
      fd.append("file", blob, "chunk.webm");

      const res = await fetch(endpoint, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Transcribe failed with status ${res.status}`);
      const json = await res.json();

      data = {
        text: json?.text ?? "",
        lang: json?.lang ?? "en",
        words: Array.isArray(json?.words) ? json.words : [],
        confidence: typeof json?.confidence === "number" ? json.confidence : undefined,
      };
    } catch (err) {
      console.warn("sendChunkAndStore: STT request failed, storing placeholder.", err);
      // keep default empty `data` so the flow continues
    }
  }

  // 2) Append to localStorage with a timestamp + id
  const entry = {
    id: (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    text: data.text || "",
    lang: data.lang || "en",
    words: data.words || [],
    confidence: data.confidence ?? null,
    ts: Date.now(),
  };

  const arr = read();
  arr.push(entry);
  localStorage.setItem(storeKey, JSON.stringify(arr));

  // 3) Notify listeners (e.g., your listenTranscriptStream local impl)
  window.dispatchEvent(new CustomEvent("transcripts_updated", { detail: { boardId } }));

  return data;
}
