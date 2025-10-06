// src/lib/clearWall.ts
// Local-only "nuclear" clear: removes all notes & edges for a board.
// Works with the localStorage/Dexie style you've been using.

export async function clearWall(boardId: string) {
  // Try common local keys first (adjust if your db uses different keys)
  const noteKey = `notes_${boardId}`;
  const edgeKey = `edges_${boardId}`;
  const transcriptKey = `transcripts_${boardId}`;

  try {
    localStorage.removeItem(noteKey);
    localStorage.removeItem(edgeKey);
    // don't clear transcripts unless you want to; leave them for now
    // localStorage.removeItem(transcriptKey);

    // Inform any listeners via a dumb "storage" event (best-effort)
    window.dispatchEvent(new StorageEvent("storage", { key: noteKey }));
    window.dispatchEvent(new StorageEvent("storage", { key: edgeKey }));
  } catch (e) {
    console.warn("[clearWall] localStorage removal failed:", e);
  }

  // If your db exposes explicit clearing APIs, prefer them:
  // e.g., await db.clearAllNotes(boardId); await db.clearAllEdges(boardId);
}
