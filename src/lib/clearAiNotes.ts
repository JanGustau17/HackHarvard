// src/lib/clearAiNotes.ts

/**
 * Remove only AI-generated notes from localStorage for a board.
 * A note is considered AI-generated if it has `fromAI: true` or `aiGenerated: true`.
 * Notes are stored under localStorage key: `notes_<boardId>` as an array.
 */
export function clearAiNotes(boardId: string): void {
  const key = `notes_${boardId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  let notes: any[] = [];
  try {
    notes = JSON.parse(raw);
    if (!Array.isArray(notes)) notes = [];
  } catch {
    notes = [];
  }

  const kept = notes.filter(
    (n) => !(n && (n.fromAI === true || n.aiGenerated === true))
  );

  localStorage.setItem(key, JSON.stringify(kept));

  // optional: notify any UI listeners to refresh notes
  window.dispatchEvent(new CustomEvent("notes_updated", { detail: { boardId } }));
}

/**
 * Optional helper if you also store edges locally and want to clear AI-made ones.
 * Edges expected under localStorage key: `edges_<boardId>`.
 */
export function clearAiEdges(boardId: string): void {
  const key = `edges_${boardId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  let edges: any[] = [];
  try {
    edges = JSON.parse(raw);
    if (!Array.isArray(edges)) edges = [];
  } catch {
    edges = [];
  }

  const kept = edges.filter(
    (e) => !(e && (e.fromAI === true || e.aiGenerated === true))
  );

  localStorage.setItem(key, JSON.stringify(kept));
  window.dispatchEvent(new CustomEvent("edges_updated", { detail: { boardId } }));
}
