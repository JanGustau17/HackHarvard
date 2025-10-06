// src/lib/AISummary.tsx
import { useEffect, useMemo, useState } from "react";
import { listenNotes, listenEdges } from "./db";
import { listenTranscriptStream } from "./transcripts";
import { applyPlanToWall } from "./planApply";
import { clearAppliedPlan } from "./clearAppliedPlan";

// ---------- Types ----------
type Note = {
  id: string;
  text: string;
  votes?: number;
  x?: number;
  y?: number;
  z?: number;
  createdAt?: number;
  updatedAt?: number;
};

type Edge = {
  id: string;
  srcId: string;
  dstId: string;
  label?: string;
};

type Chunk = {
  id: string;
  ts?: number | string;
  text: string;
  speaker?: string;
};

type DerivedTask = {
  id: string;
  title: string;
  lane: "Frontend" | "Backend";
  prio: 0 | 1 | 2;
};

// ---------- Priority & lane utilities ----------
function scorePriority(text: string): 0 | 1 | 2 {
  const t = text.toLowerCase();
  if (/\b(p0|blocker|critical|must)\b/.test(t)) return 0;
  if (/\b(p1|important|high)\b/.test(t)) return 1;
  return 2;
}

function pickLane(text: string): "Frontend" | "Backend" {
  const t = text.toLowerCase();
  if (/\b(front(end)?|ui|ux|three|webxr|ar|2d|3d|scene)\b/.test(t)) return "Frontend";
  if (/\b(back(end)?|api|storage|auth|stt|asr|llm|summary|plan|export)\b/.test(t)) return "Backend";
  return /plan|transcript|summary|export/.test(t) ? "Backend" : "Frontend";
}

// ---------- Transcript → task derivation (local-only heuristics) ----------
const FE_HINTS = [
  "ui","ux","front","frontend","webxr","ar","three","three.js","scene","canvas","2d","3d","mesh","button","panel","drag",
  "vote","sticky","note","overlay","render","shader","camera","raycast"
];
const BE_HINTS = [
  "back","backend","api","storage","auth","stt","asr","whisper","gemini","llm","summary","plan","export",
  "persistence","socket","server","schema","index","worker"
];

const P0_HINTS = ["p0","blocker","critical","must","urgent","asap","now","immediately"];
const P1_HINTS = ["p1","important","high","next","soon"];

function detectPriority(s: string): 0|1|2 {
  const t = s.toLowerCase();
  if (P0_HINTS.some(k => t.includes(k))) return 0;
  if (P1_HINTS.some(k => t.includes(k))) return 1;
  return 2;
}
function detectLane(s: string): "Frontend"|"Backend" {
  const t = s.toLowerCase();
  const fe = FE_HINTS.some(k => t.includes(k));
  const be = BE_HINTS.some(k => t.includes(k));
  if (fe && !be) return "Frontend";
  if (be && !fe) return "Backend";
  if (t.includes("transcript") || t.includes("summary") || t.includes("plan")) return "Backend";
  return "Frontend";
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeTaskLine(s: string): string {
  return s
    .replace(/^\s*[-*•]\s*/, "")         // bullets
    .replace(/^\d+\)\s*|\d+\.\s*/,"")    // numbering
    .replace(/\s*\(.*?\)\s*$/,"")        // trailing parens
    .trim();
}

function looksActionable(s: string): boolean {
  const t = s.toLowerCase();
  return /^(add|implement|create|build|fix|wire|connect|render|place|capture|summarize|export|apply|clear|detect|enable|toggle|support|show|group|prioritize)\b/.test(t)
      || /\bthen\b|\bnext\b|\bafter\b|\bso that\b/.test(t)
      || /^[\-\*•]\s+/.test(s)
      || /\btask\b|\bstep\b/.test(t);
}

function deriveTasksFromTranscript(text: string, max = 8): DerivedTask[] {
  if (!text.trim()) return [];
  const sentences = splitSentences(text);
  const raw: string[] = [];

  for (const s of sentences) {
    const parts = s.split(/;\s+|, then\s+| then\s+| and then\s+/i);
    for (const p of parts) raw.push(normalizeTaskLine(p));
  }

  const seen = new Set<string>();
  const tasks: DerivedTask[] = [];

  for (const line of raw) {
    if (!line || line.length < 6) continue;
    if (!looksActionable(line)) continue;

    const key = line.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);

    const prio = detectPriority(line);
    const lane = detectLane(line);
    tasks.push({ id: crypto.randomUUID(), title: line, lane, prio });
    if (tasks.length >= max) break;
  }

  tasks.sort((a,b) => a.prio - b.prio);
  return tasks;
}

function synthesizeEdgesFromOrder(tasks: DerivedTask[]): string[] {
  const edges: string[] = [];
  for (let i = 0; i < tasks.length - 1; i++) {
    edges.push(`${tasks[i].title} → ${tasks[i + 1].title} (follows)`);
  }
  return edges;
}

// ---------- Helpers ----------
function toArray<T = any>(v: any): T[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "object") return Object.values(v) as T[];
  return [];
}

// ---------- Component ----------
export default function AISummary({
  boardId,
  liveBrowserLines,
  aiOut,
  forcedTranscriptText, // ⬅️ NEW
}: {
  boardId: string;
  liveBrowserLines?: string[];
  aiOut?: {
    summary_md?: string;
    workplan?: { tasks?: Array<{ id?: string; title: string; priority?: string | number; lane?: string }> };
    workflow_edges?: Array<{ from: string; to: string; kind?: string }>;
  };
  forcedTranscriptText?: string; // ⬅️ NEW
}) {

  const [notes, setNotes] = useState<Note[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [busy, setBusy] = useState(false);

  // subscribe like App.tsx (boardId, cb)
  useEffect(() => {
    const unN = listenNotes((n: any) => setNotes(toArray<Note>(n))) || (() => {});
    const unE = listenEdges((e: any) => setEdges(toArray<Edge>(e))) || (() => {});
    const unT = listenTranscriptStream(boardId, (arr: any) => setChunks(toArray<Chunk>(arr)));
    return () => { unN(); unE(); unT && unT(); };
  }, [boardId]);

  // combine recorded chunks + browser STT finals
const transcriptText = useMemo(() => {
  if (forcedTranscriptText && forcedTranscriptText.trim().length) return forcedTranscriptText.trim(); // ⬅️ prefer forced
  const a = (liveBrowserLines ?? []).join(" ");
  const b = chunks.map(c => c.text).join(" ");
  return [a, b].filter(Boolean).join(" ").trim();
}, [forcedTranscriptText, liveBrowserLines, chunks]);


  // Prefer Gemini summary if present
  const summaryText = useMemo(() => {
    if (aiOut?.summary_md && aiOut.summary_md.trim().length > 0) {
      return aiOut.summary_md.trim();
    }
    if (transcriptText.length > 0) {
      const sentences = transcriptText.split(/(?<=[.!?])\s+/).slice(-3);
      return `Recent discussion highlights: ${sentences.join(" ")}`;
    }
    return "No notes yet. Add sticky notes or speak to start a plan.";
  }, [aiOut?.summary_md, transcriptText]);

  const heuristicSummary = useMemo(() => {
    if (!notes.length) return "No notes yet. Add sticky notes or speak to start a plan.";
    const p0 = notes.filter(n => scorePriority(n.text) === 0).length;
    const p1 = notes.filter(n => scorePriority(n.text) === 1).length;
    const p2 = notes.length - p0 - p1;
    const top = [...notes].sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 3);
    const topLine = top.length ? "Top items: " + top.map(t => t.text).join(" • ") + "." : "";
    return `Focus on producing a demo with tasks grouped by lanes. Priority mix — P0:${p0}, P1:${p1}, P2:${p2}. ${topLine}`;
  }, [notes]);

  // ---- Tasks source: Notes > Gemini tasks > Transcript-derived
  const geminiTasks: DerivedTask[] = useMemo(() => {
    const tasks = aiOut?.workplan?.tasks || [];
    if (!tasks.length) return [];
    return tasks.map((t) => {
      const lane = (t.lane || "").toLowerCase().includes("back") ? "Backend" :
                   (t.lane || "").toLowerCase().includes("front") ? "Frontend" :
                   pickLane(t.title);
      const prioTxt = (typeof t.priority === "string" ? t.priority : String(t.priority ?? "2")).toLowerCase();
      const prio = /\b(^0$|p0|critical|blocker|must)\b/.test(prioTxt) ? 0 :
                   /\b(^1$|p1|important|high)\b/.test(prioTxt) ? 1 : 2;
      return { id: t.id || crypto.randomUUID(), title: t.title, lane, prio };
    });
  }, [aiOut?.workplan?.tasks]);

  const derivedTasks = useMemo(() => {
    if (notes.length > 0) return [] as DerivedTask[];
    if (geminiTasks.length > 0) return geminiTasks;
    return deriveTasksFromTranscript(transcriptText, 8);
  }, [notes, geminiTasks, transcriptText]);

  // ---- Lanes (rendered as pseudo-notes when there are no real notes)
  const lanes = useMemo(() => {
    const grouped: Record<string, Note[]> = { Frontend: [], Backend: [] };

    if (notes.length > 0) {
      for (const n of notes) grouped[pickLane(n.text)].push(n);
    } else {
      for (const t of derivedTasks) {
        const n: Note = { id: t.id, text: `[P${t.prio}] ${t.title}`, votes: 0 };
        grouped[t.lane].push(n);
      }
    }

    const sortFn = (a: Note, b: Note) => {
      const pa = scorePriority(a.text), pb = scorePriority(b.text);
      if (pa !== pb) return pa - pb;
      return (b.votes || 0) - (a.votes || 0);
    };
    grouped.Frontend.sort(sortFn);
    grouped.Backend.sort(sortFn);
    return grouped;
  }, [notes, derivedTasks]);

  // ---- Edges: Gemini > local edges+notes > synthesized follows chain
  const edgesText = useMemo(() => {
    if (aiOut?.workflow_edges?.length) {
      return aiOut.workflow_edges.map((e) => `${e.from} → ${e.to}${e.kind ? ` (${e.kind})` : ""}`);
    }
    if (edges.length > 0 && notes.length > 0) {
      const idToText = new Map(notes.map(n => [n.id, n.text]));
      return edges.map(e => {
        const A = idToText.get(e.srcId) || e.srcId;
        const B = idToText.get(e.dstId) || e.dstId;
        const lbl = e.label ? ` (${e.label})` : "";
        return `${A} → ${B}${lbl}`;
      });
    }
    if (derivedTasks.length > 1) {
      return synthesizeEdgesFromOrder(derivedTasks);
    }
    return [];
  }, [aiOut?.workflow_edges, edges, notes, derivedTasks]);

  // ---- Actions ----
  async function onApplyToWall() {
    try {
      setBusy(true);

      // Build lanes from what's currently displayed
      const fe = lanes.Frontend.map(n => ({
        id: crypto.randomUUID(),
        title: n.text.replace(/^\[P\d\]\s*/,""),
        priority: scorePriority(n.text),
      }));
      const be = lanes.Backend.map(n => ({
        id: crypto.randomUUID(),
        title: n.text.replace(/^\[P\d\]\s*/,""),
        priority: scorePriority(n.text),
      }));

      const patch: any = {
        title: "AI Workplan",
        lanes: { Frontend: fe, Backend: be },
        edges: edgesText.map((t) => {
          const m = t.match(/^(.*?)\s+→\s+(.*?)(?:\s+\((.*?)\))?$/);
          return m ? { from: m[1], to: m[2], label: m[3] || "follows" } : { from: "", to: "", label: "follows" };
        }),
        meta: { source: aiOut ? "Gemini" : (notes.length ? "Notes" : "Transcript"), ts: Date.now() }
      };

      await Promise.resolve(applyPlanToWall(patch));
    } finally {
      setBusy(false);
    }
  }

  function makeReport(summary: string, lanesIn: Record<string, Note[]>, edgesLines: string[]): string {
    const fe = lanesIn["Frontend"] || [];
    const be = lanesIn["Backend"] || [];
    const fmt = (n: Note) => `- [P${scorePriority(n.text)}] ${n.text.replace(/^\[P\d\]\s*/,"")}`;
    return [
      "# SocialAR — AI Summary Report",
      "",
      "## Summary",
      summary,
      "",
      "## Workplan",
      "### Frontend",
      ...(fe.length ? fe.map(fmt) : ["(none)"]),
      "",
      "### Backend",
      ...(be.length ? be.map(fmt) : ["(none)"]),
      "",
      "## Workflow Edges",
      ...(edgesLines.length ? edgesLines.map(e => `- ${e}`) : ["(none)"]),
      ""
    ].join("\n");
  }

  function onExport() {
    const md = makeReport(
      aiOut?.summary_md?.trim() ? aiOut.summary_md.trim()
        : (transcriptText.length ? summaryText : heuristicSummary),
      lanes,
      edgesText
    );
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SocialAR-Report-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onClear() {
    try { setBusy(true); await Promise.resolve(clearAppliedPlan()); }
    finally { setBusy(false); }
  }

  const completion = useMemo(() => {
    if (notes.length) {
      const done = notes.filter(n => /\b(done|[[]done[]])\b/i.test(n.text)).length;
      return Math.round((done / notes.length) * 100);
    }
    const hits = (transcriptText.match(/\b(done|finished|complete|completed)\b/gi) || []).length;
    const denom = Math.max(derivedTasks.length, 3);
    return Math.min(100, Math.round((hits / denom) * 100));
  }, [notes, transcriptText, derivedTasks]);

  // ---- UI ----
  return (
  <div
    style={{
      padding: 16,
      color: "#e8e8e8",
      background: "#0f1216",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.08)",
      // 👇 keep the whole panel inside the window and scroll internally
      maxHeight: "calc(100vh - 220px)",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 8
    }}
  >
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={tab(false)}>Transcript</button>
        <button style={tab(true)}>AI Plan</button>
      </div>

      <div style={{ fontWeight: 700, marginBottom: 8 }}>AI Summary</div>
      <pre style={{
        whiteSpace: "pre-wrap", fontFamily: "inherit",
        background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.06)", marginBottom: 12
      }}>
- {aiOut?.summary_md?.trim() ? aiOut.summary_md.trim() :
   (transcriptText.length ? summaryText : heuristicSummary)}
      </pre>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={onApplyToWall} style={btn()}>Apply to Wall</button>
        <button disabled={busy} onClick={onExport} style={btn()}>Export Full Report</button>
        <button disabled={busy} onClick={onClear} style={btn(true)}>Clear Applied Plan</button>
      </div>

      <hr style={{ borderColor: "rgba(255,255,255,0.08)", margin: "8px 0 12px" }} />

      <div style={{ fontWeight: 700, marginBottom: 10 }}>Workplan</div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
        <Lane title="Frontend" items={lanes.Frontend} />
        <Lane title="Backend"  items={lanes.Backend} />
      </div>

      <div style={{
        height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 999,
        overflow: "hidden", marginBottom: 10
      }}>
        <div style={{ width: `${completion}%`, height: "100%", background: "rgba(120,200,255,0.9)" }} />
      </div>

      <div style={{ fontWeight: 700, marginBottom: 8 }}>Workflow Edges</div>
      <pre style={{
        whiteSpace: "pre-wrap", fontFamily: "inherit",
        background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.06)"
      }}>
{edgesText.length ? "• " + edgesText.join("\n• ") : "(none yet)"}
      </pre>
    </div>
  );
}

// ---------- UI bits ----------
function Lane({ title, items }: { title: string; items: Note[] }) {
  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12,
      background: "rgba(255,255,255,0.02)"
    }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.length ? items.map(n => (
          <div key={n.id} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            padding: 10, borderRadius: 10
          }}>
            <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 2 }}>
              [P{scorePriority(n.text)}]{typeof n.votes === "number" ? ` · ${n.votes}★` : ""}
            </div>
            <div>{n.text.replace(/^\[P\d\]\s*/,"")}</div>
          </div>
        )) : <div style={{ opacity: 0.7 }}>(no items)</div>}
      </div>
    </div>
  );
}

function btn(destructive = false): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: destructive ? "rgba(255,75,75,0.08)" : "rgba(255,255,255,0.06)",
    color: "#eaeaea",
    cursor: "pointer"
  };
}
function tab(active: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${active ? "rgba(120,200,255,0.6)" : "rgba(255,255,255,0.15)"}`,
    background: active ? "rgba(120,200,255,0.08)" : "transparent",
    color: active ? "#cfeeff" : "#cfcfcf",
    cursor: "default"
  };
}
