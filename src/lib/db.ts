// src/lib/db.ts
// Local-only data layer using localStorage + CustomEvents (no Firebase)

import type { NoteDoc, EdgeDoc, Pose } from "../types";

/** --------------------------- storage keys & utils ------------------------ */

const notesKey   = (boardId: string) => `notes_${boardId}`;
const edgesKey   = (boardId: string) => `edges_${boardId}`;
const boardKey   = (boardId: string) => `board_${boardId}`;
const uid = () => (crypto?.randomUUID?.() ?? String(Math.random()).slice(2));

type StoredNote = NoteDoc & { id: string; aiGenerated?: boolean; fromAI?: boolean };
type StoredEdge = EdgeDoc & { id: string; aiGenerated?: boolean; fromAI?: boolean };

function readArray<T = any>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const val = JSON.parse(raw);
    return Array.isArray(val) ? (val as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T = any>(key: string, arr: T[]) {
  localStorage.setItem(key, JSON.stringify(arr));
}

function dispatch(topic: "notes_updated" | "edges_updated" | "board_updated", detail: any) {
  window.dispatchEvent(new CustomEvent(topic, { detail }));
}

/** ------------------------------ public API ------------------------------ */

/** Ensure a "board doc" exists. Safe to call repeatedly. */
export async function createBoardIfMissing(boardId: string) {
  const key = boardKey(boardId);
  if (!localStorage.getItem(key)) {
    localStorage.setItem(
      key,
      JSON.stringify({ id: boardId, createdAt: Date.now() })
    );
    dispatch("board_updated", { boardId });
  }
}

/** Add a sticky note. Returns the generated note id. */
export async function addNote(boardId: string, note: NoteDoc & { aiGenerated?: boolean; fromAI?: boolean }) {
  const notes = readArray<StoredNote>(notesKey(boardId));
  const id = uid();
  const stored: StoredNote = { id, ...note };
  notes.push(stored);
  writeArray(notesKey(boardId), notes);
  dispatch("notes_updated", { boardId });
  return id;
}

/** Increment votes on a note. */
export async function voteNote(boardId: string, noteId: string, delta = 1) {
  const notes = readArray<StoredNote>(notesKey(boardId));
  const n = notes.find(n => n.id === noteId);
  if (n) {
    (n as any).votes = (n as any).votes ? Number((n as any).votes) + delta : delta;
    writeArray(notesKey(boardId), notes);
    dispatch("notes_updated", { boardId });
  }
}

/** Add an edge between two notes. Returns the generated edge id. */
export async function addEdge(
  boardId: string,
  from: string,
  to: string,
  kind: EdgeDoc["kind"] = "follows",
  extra?: { aiGenerated?: boolean; fromAI?: boolean }
) {
  const edges = readArray<StoredEdge>(edgesKey(boardId));
  const id = uid();
  const edge: StoredEdge = { id, from, to, kind, ...(extra || {}) };
  edges.push(edge);
  writeArray(edgesKey(boardId), edges);
  dispatch("edges_updated", { boardId });
  return id;
}

// lib/db.ts
export async function updateNotePose(boardId: string, id: string, pose: { position: number[]; quaternion: number[] }) {
  // If you store notes in localStorage:
  const key = `notes_${boardId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const obj = JSON.parse(raw);
  if (obj[id]) {
    obj[id].pose = pose;
    localStorage.setItem(key, JSON.stringify(obj));
    // trigger your listeners if needed
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }
}

// src/lib/db.ts
export async function updateNoteSize(
  boardId: string,
  id: string,
  size: number
) {
  const key = `notes_${boardId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const notes = JSON.parse(raw);
  if (notes[id]) {
    notes[id].size = size;
    localStorage.setItem(key, JSON.stringify(notes));
    // notify any listeners that depend on storage (optional)
    try {
      window.dispatchEvent(new StorageEvent("storage", { key }));
    } catch {}
  }
}


/** Remove a note by id (helper if you need it) */
export async function removeNote(boardId: string, noteId: string) {
  const notes = readArray<StoredNote>(notesKey(boardId));
  const next = notes.filter(n => n.id !== noteId);
  writeArray(notesKey(boardId), next);
  dispatch("notes_updated", { boardId });
}

/** Remove an edge by id (helper if you need it) */
export async function removeEdge(boardId: string, edgeId: string) {
  const edges = readArray<StoredEdge>(edgesKey(boardId));
  const next = edges.filter(e => e.id !== edgeId);
  writeArray(edgesKey(boardId), next);
  dispatch("edges_updated", { boardId });
}

/** ------------------------------ listeners ------------------------------- */
/**
 * Live listener for notes (added/modified/removed).
 * We emulate Firestore-style docChanges by diffing prior state.
 */
export function listenNotes(
  boardId: string,
  cb: (id: string, data: NoteDoc, changeType: "added" | "modified" | "removed") => void
) {
  let prev = arrToMap(readArray<StoredNote>(notesKey(boardId)));

  // Emit initial "added" set to mirror Firestore behavior
  for (const [id, doc] of prev) cb(id, stripId(doc), "added");

  const handler = () => {
    const currentArr = readArray<StoredNote>(notesKey(boardId));
    const curr = arrToMap(currentArr);

    // removed
    for (const id of prev.keys()) {
      if (!curr.has(id)) cb(id, stripId(prev.get(id)!), "removed");
    }
    // added/modified
    for (const [id, now] of curr) {
      if (!prev.has(id)) cb(id, stripId(now), "added");
      else if (JSON.stringify(now) !== JSON.stringify(prev.get(id))) cb(id, stripId(now), "modified");
    }
    prev = curr;
  };

  window.addEventListener("notes_updated", handler as EventListener);
  window.addEventListener("storage", handler as EventListener); // cross-tab support

  return () => {
    window.removeEventListener("notes_updated", handler as EventListener);
    window.removeEventListener("storage", handler as EventListener);
  };
}

/**
 * Live listener for edges (added/modified/removed).
 */
export function listenEdges(
  boardId: string,
  cb: (id: string, data: EdgeDoc, changeType: "added" | "modified" | "removed") => void
) {
  let prev = arrToMap(readArray<StoredEdge>(edgesKey(boardId)));

  // initial
  for (const [id, doc] of prev) cb(id, stripId(doc), "added");

  const handler = () => {
    const currentArr = readArray<StoredEdge>(edgesKey(boardId));
    const curr = arrToMap(currentArr);

    for (const id of prev.keys()) {
      if (!curr.has(id)) cb(id, stripId(prev.get(id)!), "removed");
    }
    for (const [id, now] of curr) {
      if (!prev.has(id)) cb(id, stripId(now), "added");
      else if (JSON.stringify(now) !== JSON.stringify(prev.get(id))) cb(id, stripId(now), "modified");
    }
    prev = curr;
  };

  window.addEventListener("edges_updated", handler as EventListener);
  window.addEventListener("storage", handler as EventListener);

  return () => {
    window.removeEventListener("edges_updated", handler as EventListener);
    window.removeEventListener("storage", handler as EventListener);
  };
}

/** ---------------------------- small helpers ----------------------------- */

function arrToMap<T extends { id: string }>(arr: T[]) {
  const m = new Map<string, T>();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function stripId<T extends { id: string }>(obj: T): any {
  const { id, ...rest } = obj as any;
  return rest;
}

/** (Optional) Small helpers if you need them elsewhere to keep parity */
export const paths = {
  board: (id: string) => boardKey(id),
  notes: (id: string) => notesKey(id),
  edges: (id: string) => edgesKey(id),
  transcripts: (id: string) => `transcripts_${id}`, // kept for consistency with your codebase
  aiOut: (id: string) => `ai_out_${id}`,
};
