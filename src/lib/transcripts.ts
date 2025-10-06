// src/lib/transcripts.ts

export type TranscriptDoc = {
  id?: string;
  text: string;
  ts?: number;         // timestamp (ms)
  lang?: string;
  confidence?: number;
};

function trKey(boardId: string) {
  return `transcripts_${boardId}`;
}

/**
 * Subscribe to transcript changes for a board.
 * Uses localStorage and a storage event listener.
 */
export function listenTranscriptStream(
  boardId: string,
  cb: (docs: TranscriptDoc[]) => void
): () => void {
  const readNow = () => {
    const raw = localStorage.getItem(trKey(boardId));
    let list: TranscriptDoc[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }
    cb(list);
  };

  // Initial read
  readNow();

  // Watch localStorage changes (fires across tabs)
  const handler = (e: StorageEvent) => {
    if (e.key === trKey(boardId)) readNow();
  };
  window.addEventListener("storage", handler);

  // Optional: polling fallback for same-tab updates
  const iv = setInterval(readNow, 2000);

  return () => {
    window.removeEventListener("storage", handler);
    clearInterval(iv);
  };
}

/**
 * Append a new transcript line to localStorage.
 */
export function addTranscriptLine(boardId: string, text: string) {
  const raw = localStorage.getItem(trKey(boardId));
  let list: TranscriptDoc[] = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  const entry: TranscriptDoc = {
    id: crypto.randomUUID(),
    text,
    ts: Date.now(),
  };
  list.push(entry);
  localStorage.setItem(trKey(boardId), JSON.stringify(list));
}
