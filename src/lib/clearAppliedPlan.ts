// src/lib/clearAppliedPlan.ts

/**
 * Clear only AI-generated notes and edges from localStorage.
 * Leaves user-created content untouched.
 */
export async function clearAppliedPlan(boardId: string) {
  // Clear AI-generated notes
  const notesKey = `notes_${boardId}`;
  const notes = JSON.parse(localStorage.getItem(notesKey) || "[]");
  const filteredNotes = notes.filter((n: any) => !n.aiGenerated);
  localStorage.setItem(notesKey, JSON.stringify(filteredNotes));

  // Clear AI-generated edges
  const edgesKey = `edges_${boardId}`;
  const edges = JSON.parse(localStorage.getItem(edgesKey) || "[]");
  const filteredEdges = edges.filter((e: any) => !e.aiGenerated);
  localStorage.setItem(edgesKey, JSON.stringify(filteredEdges));
}
