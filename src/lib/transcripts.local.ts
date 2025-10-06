// Minimal local transcript helpers used by App.tsx
// You already had addFinalTranscriptLine + listenTranscriptStream in your project.
// If not, here’s a tiny reference implementation:

const keyFor = (boardId: string) => `transcripts:${boardId}`;

export type TranscriptRow = { id: string; text: string; ts?: number };

export async function addFinalTranscriptLine(boardId: string, text: string) {
  const arr = loadTranscripts(boardId);
  arr.push({ id: crypto.randomUUID(), text, ts: Date.now() });
  localStorage.setItem(keyFor(boardId), JSON.stringify(arr));
}

export function listenTranscriptStream(
  boardId: string,
  cb: (rows: TranscriptRow[]) => void
) {
  // naive polling (since we’re localStorage-only)
  let alive = true;
  const tick = () => {
    if (!alive) return;
    cb(loadTranscripts(boardId));
  };
  tick();
  const iv = setInterval(tick, 1000);
  return () => { alive = false; clearInterval(iv); };
}

export function clearTranscriptsLocal(boardId: string) {
  localStorage.removeItem(keyFor(boardId));
}

function loadTranscripts(boardId: string): TranscriptRow[] {
  try {
    return JSON.parse(localStorage.getItem(keyFor(boardId)) || "[]");
  } catch {
    return [];
  }
}
