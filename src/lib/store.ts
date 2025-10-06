import localforage from "localforage";

// --- types ---
export type Pose = { position:[number,number,number], quaternion:[number,number,number,number] };
export type NoteDoc = { text:string; color:string; pose:Pose; size:number; votes:number; byAI?:boolean };
export type EdgeDoc = { from:string; to:string; kind?: "blocks"|"follows"|"verifies" };
export type TranscriptDoc = { id:string; text:string; lang:string; ts:number };
export type AIOutput = {
  summary_md:string;
  workplan:{ tasks:Array<{ id:string; title:string; description?:string; owner?:string; eta?:string; priority?:string; dependsOn?:string[] }>; lanes?:string[] };
  workflow_edges:Array<{from:string; to:string; kind?:string}>;
  createdAt:number;
};

localforage.config({ name: "idea-wall" });

// simple event bus for live listeners
const bus = new EventTarget();
function emit(type:string, detail:any){ bus.dispatchEvent(new CustomEvent(type,{detail}));}

// get/set helpers
async function getJSON<T>(key:string, fallback:T): Promise<T> {
  const v = await localforage.getItem<string>(key);
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}
async function setJSON<T>(key:string, v:T) {
  await localforage.setItem(key, JSON.stringify(v));
}

export async function createBoardIfMissing(boardId:string){
  const key = `boards/${boardId}`;
  const exists = await localforage.getItem(key);
  if (!exists) await localforage.setItem(key, JSON.stringify({createdAt:Date.now()}));
}

export async function addNote(boardId:string, note:NoteDoc){
  const key = `boards/${boardId}/notes`;
  const notes = await getJSON<Record<string,NoteDoc>>(key, {});
  const id = crypto.randomUUID();
  notes[id] = note;
  await setJSON(key, notes);
  emit(`notes:${boardId}`, { id, type:"added", data:note });
}

export async function voteNote(boardId:string, noteId:string, delta=1){
  const key = `boards/${boardId}/notes`;
  const notes = await getJSON<Record<string,NoteDoc>>(key, {});
  if (!notes[noteId]) return;
  notes[noteId].votes = (notes[noteId].votes||0) + delta;
  await setJSON(key, notes);
  emit(`notes:${boardId}`, { id:noteId, type:"modified", data:notes[noteId] });
}

export async function updateNotePose(boardId:string, noteId:string, pose:Pose){
  const key = `boards/${boardId}/notes`;
  const notes = await getJSON<Record<string,NoteDoc>>(key, {});
  if (!notes[noteId]) return;
  notes[noteId].pose = pose;
  await setJSON(key, notes);
  emit(`notes:${boardId}`, { id:noteId, type:"modified", data:notes[noteId] });
}

export async function addEdge(boardId:string, from:string, to:string, kind:EdgeDoc["kind"]="follows"){
  const key = `boards/${boardId}/edges`;
  const edges = await getJSON<Record<string,EdgeDoc>>(key, {});
  const id = crypto.randomUUID();
  edges[id] = { from, to, kind };
  await setJSON(key, edges);
  emit(`edges:${boardId}`, { id, type:"added", data:edges[id] });
}

// listeners
export function listenNotes(
  boardId:string,
  cb:(id:string, data:NoteDoc, type:"added"|"modified"|"removed")=>void
){
  const key = `boards/${boardId}/notes`;
  let stopped = false;

  // initial fire
  (async ()=>{
    const notes = await getJSON<Record<string,NoteDoc>>(key, {});
    if (stopped) return;
    Object.entries(notes).forEach(([id, data]) => cb(id, data, "added"));
  })();

  const fn = (e:any)=> cb(e.detail.id, e.detail.data, e.detail.type);
  bus.addEventListener(`notes:${boardId}`, fn);
  return ()=> { stopped = true; bus.removeEventListener(`notes:${boardId}`, fn); };
}

export function listenEdges(
  boardId:string,
  cb:(id:string, data:EdgeDoc, type:"added"|"modified"|"removed")=>void
){
  const key = `boards/${boardId}/edges`;
  let stopped = false;
  (async ()=>{
    const edges = await getJSON<Record<string,EdgeDoc>>(key, {});
    if (stopped) return;
    Object.entries(edges).forEach(([id, data]) => cb(id, data, "added"));
  })();
  const fn = (e:any)=> cb(e.detail.id, e.detail.data, e.detail.type);
  bus.addEventListener(`edges:${boardId}`, fn);
  return ()=> { stopped = true; bus.removeEventListener(`edges:${boardId}`, fn); };
}

// transcripts
export async function appendTranscript(boardId:string, t:Omit<TranscriptDoc,"id">){
  const key = `boards/${boardId}/transcripts`;
  const list = await getJSON<TranscriptDoc[]>(key, []);
  const doc = { id: crypto.randomUUID(), ...t };
  list.push(doc);
  await setJSON(key, list.slice(-200)); // keep last 200 chunks
  emit(`transcripts:${boardId}`, { list });
}
export function listenTranscriptStream(boardId:string, cb:(list:TranscriptDoc[])=>void){
  const key = `boards/${boardId}/transcripts`;
  let stopped=false;
  (async ()=>{ const l = await getJSON<TranscriptDoc[]>(key, []); if(!stopped) cb(l); })();
  const fn = (e:any)=> cb(e.detail.list);
  bus.addEventListener(`transcripts:${boardId}`, fn);
  return ()=>{ stopped=true; bus.removeEventListener(`transcripts:${boardId}`, fn); };
}

// AI outputs
export async function writeAIOutput(boardId:string, out:AIOutput){
  const key = `boards/${boardId}/ai_outputs`;
  const list = await getJSON<AIOutput[]>(key, []);
  list.push(out);
  await setJSON(key, list.slice(-20));
  emit(`ai:${boardId}`, { latest: out });
}
export function listenLatestAIOutput(boardId:string, cb:(out:AIOutput|null)=>void){
  const key = `boards/${boardId}/ai_outputs`;
  let stopped=false;
  (async ()=>{
    const list = await getJSON<AIOutput[]>(key, []);
    if (!stopped) cb(list[list.length-1] || null);
  })();
  const fn = (e:any)=> cb(e.detail.latest || null);
  bus.addEventListener(`ai:${boardId}`, fn);
  return ()=>{ stopped=true; bus.removeEventListener(`ai:${boardId}`, fn); };
}

// utilities for tests/clear
export async function clearAiNotes(boardId:string){
  const key = `boards/${boardId}/notes`;
  const notes = await getJSON<Record<string,NoteDoc>>(key, {});
  const next: Record<string,NoteDoc> = {};
  for (const [id, n] of Object.entries(notes)) if (!n.byAI) next[id]=n;
  await setJSON(key, next);
  emit(`notes:${boardId}`, { id: "_bulk", type: "modified", data: {} });
}
