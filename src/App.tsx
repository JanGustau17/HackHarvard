// src/App.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import "./styles.css";

import {
  createBoardIfMissing,
  addNote,
  listenNotes,
  voteNote,
  addEdge,
  listenEdges,
  updateNotePose,
  updateNoteSize,
} from "./lib/db";

import * as WebXRSceneMod from "./ar/WebXRScene";
import { Web2DScene } from "./ar/Web2DScene";
import { makeNoteMesh } from "./ar/NoteMesh";
import type { NoteDoc } from "./types";
import * as THREE from "three";

import { applyPlanToWall } from "./lib/planApply";
import { clearAppliedPlan } from "./lib/clearAppliedPlan";
import { clearWall } from "./lib/clearWall";

import { createBrowserSTT } from "./lib/stt";
import { createChunkRecorder } from "./lib/recorder";
import { sendChunkAndStore } from "./lib/uploadChunk";

import ProgressTab from "./lib/ProgressTab";
import NoteModal from "./components/NoteModal";

import { listenTranscriptStream, TranscriptDoc } from "./lib/transcripts";
import {
  createPlanFromTranscript,
  refinePlan,
  summarizePlan,
  hasGeminiKey,
} from "./lib/aiPlanGemini";
import { listenLatestAIOutput, AIOutput } from "./lib/aiOutputs";
import AISummary from "./lib/AISummary";
import { demoTranscripts, demoAI } from "./lib/demoData";

/* --------------------------------- Config -------------------------------- */
const BOARD_ID = "demo";

function getXRSceneCtor() {
  const mod: any = WebXRSceneMod as any;
  return mod.WebXRScene || mod.default || mod;
}

type LogEntry = { ts: number; text: string };

/* ------------------------------ AI Console UI ---------------------------- */
function AiConsole({
  open,
  onClose,
  summaryMd,
  logs,
  busy,
  onSubmitPrompt,
  onApplyPlan,
  onExport,
  onClearApplied,
  micOn,
  onToggleMic,
  onAttachFiles,
  startAR,
  linkMode,
  setLinkMode,
  summarizeNow,
  geminiKeyLoaded,
  clearWall,
  engine,
  setEngine,
  serverRecording,
  toggleSTT,
  demoMode,
  uid,
  onReadAloud,
  isTtsBusy,
  status,
}: {
  open: boolean;
  onClose: () => void;
  summaryMd: string | undefined;
  logs: LogEntry[];
  busy: boolean;
  onSubmitPrompt: (prompt: string) => void;
  onApplyPlan: () => void;
  onExport: () => void;
  onClearApplied: () => void;
  micOn: boolean;
  onToggleMic: () => void;
  onAttachFiles: (files: FileList) => void;
  startAR: () => void;
  linkMode: boolean;
  setLinkMode: (v: boolean) => void;
  summarizeNow: () => void;
  geminiKeyLoaded: boolean;
  clearWall: () => void;
  engine: "browser" | "server";
  setEngine: (e: "browser" | "server") => void;
  serverRecording: boolean;
  toggleSTT: () => void;
  demoMode: () => void;
  uid: string;
  onReadAloud: () => void;
  isTtsBusy: boolean;
  status: string;
}) {
  const [prompt, setPrompt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachedNames, setAttachedNames] = useState<string[]>([]);

  if (!open) return null;

  return (
    <div
      className="fixed bottom-20 right-4 z-50 w-[560px] max-w-[96vw] select-none"
      role="dialog"
      aria-label="AI Console"
    >
      <div
        style={{
          borderRadius: 20,
          border: "1px solid #444",
          background: "#181c24f2",
          boxShadow: "0 8px 32px #0004",
          padding: 24,
          minWidth: 340,
        }}
      >
        {/* Top controls row */}
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 18,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={startAR}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#23272f",
                color: "#ffd166",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid #444",
              }}
            >
              Start AR
            </button>

            <button
              onClick={() => setLinkMode(!linkMode)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: linkMode ? "#ffd166" : "#23272f",
                color: linkMode ? "#23272f" : "#ffd166",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid #444",
              }}
            >
              {linkMode ? "Exit Link Mode" : "Link Mode"}
            </button>

            <button
              onClick={summarizeNow}
              disabled={!geminiKeyLoaded}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: geminiKeyLoaded ? "#6366f1" : "#23272f",
                color: "#fff",
                fontWeight: 500,
                fontSize: 15,
                border: "none",
                opacity: geminiKeyLoaded ? 1 : 0.5,
              }}
            >
              Summarize Now
            </button>

            <button
              onClick={clearWall}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#23272f",
                color: "#ffd166",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid #444",
              }}
            >
              Clear Wall
            </button>

            <button
              onClick={toggleSTT}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#23272f",
                color: "#ffd166",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid #444",
              }}
            >
              {engine === "browser"
                ? "Toggle Browser STT"
                : serverRecording
                ? "Stop Mic"
                : "Start Mic"}
            </button>

            {/* Attach (hidden input) */}
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.json,.c,.cpp,.js,.ts,.tsx,.py"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) {
                  setAttachedNames(Array.from(files).map((f) => f.name));
                  onAttachFiles(files);
                }
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#23272f",
                color: "#ffd166",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid #444",
              }}
              title="Attach files"
            >
              Attach
            </button>

            <button
              onClick={demoMode}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#23272f",
                color: "#ffd166",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid #444",
              }}
            >
              Demo Mode
            </button>

            {/* Attached names preview */}
            <div
              style={{
                fontSize: 12,
                color: "#e6eef7",
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={attachedNames.join(", ")}
            >
              {attachedNames.join(", ")}
            </div>
          </div>

          <span
            style={{
              fontSize: 13,
              background: "#23272f",
              color: geminiKeyLoaded ? "#22c55e" : "#ef4444",
              borderRadius: 6,
              padding: "2px 8px",
              marginLeft: "auto",
            }}
          >
            {geminiKeyLoaded ? "Gemini ✅" : "Gemini key missing ⚠️"}
          </span>
        </div>

        {/* Header / Export / Hide */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 18 }}>AI Console</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onReadAloud}
              disabled={isTtsBusy || !summaryMd}
              style={{ fontSize: 13, padding: "4px 12px", borderRadius: 8, border: "1px solid #444", background: "#23272f", color: "#ffd166", opacity: (isTtsBusy || !summaryMd) ? 0.5 : 1 }}>
              {isTtsBusy ? "Reading..." : "Read Aloud"}
            </button>
            <button
              onClick={onExport}
              style={{
                fontSize: 13,
                padding: "4px 12px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#23272f",
                color: "#ffd166",
              }}
            >
              Export
            </button>
            <button
              onClick={onClose}
              title="Hide console"
              aria-label="Hide AI Console"
              style={{
                fontSize: 13,
                padding: "4px 12px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#23272f",
                color: "#ffd166",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            fontSize: 15,
            color: "#e6eef7",
            marginBottom: 16,
            maxHeight: 120,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {summaryMd || "(No summary yet. Click Summarize or send a prompt.)"}
        </div>

        {/* Logs */}
        <div
          style={{
            fontSize: 12,
            fontFamily: "monospace",
            background: "#23272f",
            borderRadius: 8,
            padding: 8,
            maxHeight: 80,
            overflow: "auto",
            marginBottom: 16,
          }}
        >
          {logs.length === 0 ? (
            <div style={{ opacity: 0.6 }}>[log] Console ready.</div>
          ) : (
            logs.slice(-60).map((l, i) => (
              <div key={i} style={{ whiteSpace: "pre" }}>
                {new Date(l.ts).toLocaleTimeString()} — {l.text}
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            onClick={onApplyPlan}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              background: "#22c55e",
              color: "#fff",
              fontWeight: 500,
              fontSize: 15,
              border: "none",
            }}
          >
            Apply to Wall
          </button>
          <button
            onClick={onClearApplied}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              background: "#23272f",
              color: "#ffd166",
              fontWeight: 500,
              fontSize: 15,
              border: "1px solid #444",
            }}
          >
            Clear Applied
          </button>
        </div>

        {/* Prompt */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!prompt.trim() || busy) return;
            onSubmitPrompt(prompt.trim());
            setPrompt("");
          }}
          style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask AI to modify the plan (e.g., add a QA lane, reprioritize P0s)…"
            rows={3}
            style={{
              flex: 1,
              borderRadius: 8,
              border: "1px solid #444",
              background: "#23272f",
              padding: "10px 14px",
              fontSize: 15,
              color: "#e6eef7",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                background: "#6366f1",
                color: "#fff",
                fontWeight: 500,
                fontSize: 15,
                border: "none",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Thinking…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => (window as any).__setAITab?.()}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                background: "#23272f",
                color: "#ffd166",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid #444",
              }}
            >
              Update AI Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------- App ---------------------------------- */

export default function App() {
  /* Canvas/Scene */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const xrRef = useRef<any>(null);

  /* UI State */
  const [uid] = useState("local");
  const [status, setStatus] = useState("");
  const [linkMode, setLinkMode] = useState(false);
  const linkStartId = useRef<string | null>(null);

  const [tab, setTab] = useState<"Transcript" | "AI" | "Progress">("Transcript");
  const [aiOut, setAiOut] = useState<AIOutput | null>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const pushLog = (text: string) => setLogs((prev) => [...prev, { ts: Date.now(), text }]);
  const [isTtsBusy, setIsTtsBusy] = useState(false);

  /* Scene Maps */
  const notesMap = useRef<Map<string, THREE.Object3D>>(new Map());
  const edgesMap = useRef<Map<string, THREE.Line>>(new Map());
  const noteIdByMesh = useRef<WeakMap<THREE.Object3D, string>>(new WeakMap());

  /* Drag/Resize */
  const draggingId = useRef<string | null>(null);
  const dragPlane = useRef(new THREE.Plane());
  const dragOffset = useRef(new THREE.Vector3());
  const lastDown = useRef<{ x: number; y: number } | null>(null);

  const resizingId = useRef<string | null>(null);
  const resizeStart = useRef<{ startSize: number; startY: number } | null>(null);
  const noteSizeMap = useRef<Map<string, number>>(new Map());

  /* STT */
  const [engine, setEngine] = useState<"browser" | "server">("browser");
  const [browserPartial, setBrowserPartial] = useState("");
  const [browserLines, setBrowserLines] = useState<string[]>([]);
  const browserSttRef = useRef<ReturnType<typeof createBrowserSTT>>();
  const serverRecRef = useRef<ReturnType<typeof createChunkRecorder>>();
  const [serverRecording, setServerRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptDoc[]>([]);
  const [browserMicOn, setBrowserMicOn] = useState(false);

  /* Modal */
  const [showNoteModal, setShowNoteModal] = useState(false);
  const pendingPose = useRef<any>(null);

  /* ---------- helpers for dragging on the board plane (not ground) -------- */
  const _tmpV = useRef(new THREE.Vector3()).current;
  const _tmpQ = useRef(new THREE.Quaternion()).current;
  const _tmpS = useRef(new THREE.Vector3()).current;

  function getBoardObject(scene: any): THREE.Object3D | null {
    return scene?.boardMesh || scene?.board?.mesh || scene?.board || scene?.wall || null;
  }

  function setPlaneToBoard(plane: THREE.Plane, scene: any) {
    const board = getBoardObject(scene);
    if (board && board.matrixWorld) {
      board.updateMatrixWorld(true);
      board.matrixWorld.decompose(_tmpV, _tmpQ, _tmpS);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(_tmpQ).normalize(); // board forward
      plane.setFromNormalAndCoplanarPoint(normal, _tmpV.clone());
    } else {
      // Fallback if board hasn't been placed yet
      plane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0)
      );
    }
  }

  /* Init board + listeners */
  useEffect(() => {
    createBoardIfMissing(BOARD_ID);
  }, []);
  useEffect(() => listenLatestAIOutput(BOARD_ID, setAiOut), []);
  useEffect(() => listenTranscriptStream(BOARD_ID, setTranscripts), []);

  /* Demo mode shortcut */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      setTranscripts(demoTranscripts as any);
      setAiOut(demoAI);
      setTab("AI");
      setAiOpen(true);
    }
  }, []);

  /* Allow “Update AI Plan” button to switch to AI tab */
  useEffect(() => {
    (window as any).__setAITab = () => setTab("AI");
    return () => delete (window as any).__setAITab;
  }, []);

  /* ----------------------------- Start AR / 2D ---------------------------- */
  async function startAR() {
    if (!canvasRef.current) return;

    // Prefer WebXR if available; fall back to the 2D scene
    const useXR = typeof (navigator as any).xr !== "undefined" && window.isSecureContext;

    let SceneCtor: any = Web2DScene;
    if (useXR) {
      try {
        const MaybeCtor = getXRSceneCtor();
        if (typeof MaybeCtor === "function") SceneCtor = MaybeCtor;
      } catch {
        /* keep 2D fallback */
      }
    }

    const scene = new SceneCtor(canvasRef.current);
    xrRef.current = scene;

    // Optional callbacks if supported by the scene
    if ("onPlaceBoard" in scene) {
      (scene as any).onPlaceBoard = () => setStatus("Board placed. Tap to add notes.");
    }
    if ("onPlaceNote" in scene) {
      (scene as any).onPlaceNote = (pose: any) => {
        pendingPose.current = pose;
        setShowNoteModal(true);
      };
    }

    // Try common start method names
    const startFns = ["startAR", "start", "begin", "run", "init"] as const;
    let started = false;
    for (const name of startFns) {
      const fn = (scene as any)[name];
      if (typeof fn === "function") {
        try {
          const ret = fn.call(scene);
          if (ret && typeof ret.then === "function") await ret;
          started = true;
          break;
        } catch (e) {
          console.warn(`Scene.${name} threw:`, e);
        }
      }
    }

    if (!started) {
      alert("Unable to start the scene (no start/startAR/begin/init).");
      return;
    }

    setStatus(useXR ? "Tap to place the board." : "Click to place the board.");
  }

  /* -------- Build AIOutput from WorkPlan (Gemini or local fallback) ------ */
  const buildAIOutputFromPlan = useCallback(async (userPrompt?: string) => {
    const transcriptText = [
      ...browserLines,
      ...transcripts.map((t: any) => t?.text ?? String(t)),
    ].join("\n");

    let plan = await createPlanFromTranscript(transcriptText);
    if (userPrompt && userPrompt.trim()) {
      plan = await refinePlan({ plan, userPrompt });
    }
    const summary = await summarizePlan({ plan });

    const out: AIOutput = {
      summary_md: summary,
      workplan: {
        tasks: plan.steps.map((s) => ({
          title: s.text,
          owner: s.owner,
          eta: s.dueDate,
          priority: undefined,
          lane: undefined,
          id: s.id,
        })),
      },
      workflow_edges: [],
    };
    return out;
  }, [browserLines, transcripts]);

  function hasRenderable(out: AIOutput | null | undefined) {
    return !!out && Array.isArray(out.workplan?.tasks) && out.workplan.tasks.length > 0;
  }

  async function ensureRenderableAIOut(): Promise<AIOutput> {
    if (hasRenderable(aiOut)) return aiOut as AIOutput;

    const built = await buildAIOutputFromPlan();
    if (hasRenderable(built)) {
      setAiOut(built);
      return built;
    }

    setAiOut(demoAI as AIOutput);
    return demoAI as AIOutput;
  }

  const summarizeNow = useCallback(async () => {
    try {
      setAiBusy(true);
      setAiOpen(true);
      pushLog("Building work plan…");
      setStatus("Generating plan…");
      const out = await buildAIOutputFromPlan();
      setAiOut(out);
      pushLog("Plan generated.");
      setStatus("Plan generated.");
      setTab("AI");
    } catch (e: any) {
      pushLog(`Error: ${e?.message || "plan failed"}`);
      alert(e?.message || "plan failed");
    } finally {
      setAiBusy(false);
    }
  }, [buildAIOutputFromPlan]);

  const promptPlanUpdate = useCallback(
    async (prompt: string) => {
      try {
        setAiBusy(true);
        setAiOpen(true);
        pushLog(`➡ Prompt: ${prompt}`);
        setStatus("AI updating plan…");
        const out = await buildAIOutputFromPlan(prompt);
        setAiOut(out);
        pushLog("✅ Plan updated.");
        setStatus("Plan updated.");
        setTab("AI");
      } catch (e: any) {
        pushLog(`❌ Update failed: ${e?.message || "unknown error"}`);
        alert(e?.message || "update failed");
      } finally {
        setAiBusy(false);
      }
    },
    [buildAIOutputFromPlan]
  );

  const handleReadAloud = useCallback(async () => {
    if (!aiOut?.summary_md || isTtsBusy) return;

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
    const voiceId = import.meta.env.VITE_ELEVENLABS_VOICE_ID;
    const text = aiOut.summary_md;

    if (!apiKey || !voiceId) {
      alert("ElevenLabs API Key or Voice ID is missing from your .env file.");
      return;
    }

    setIsTtsBusy(true);
    pushLog("Generating audio…");

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      });

      if (!response.ok) {
        // This new block will give us a detailed error message
        const errorData = await response.json();
        const errorMessage = errorData.detail?.message || JSON.stringify(errorData);
        throw new Error(`(${response.status}) ${errorMessage}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
      pushLog("Audio playing.");

    } catch (err: any) {
      console.error("Failed to generate audio:", err);
      alert(`Failed to generate audio: ${err.message}`);
      pushLog(`Error generating audio: ${err.message}`);
    } finally {
      setIsTtsBusy(false);
    }
}, [aiOut, isTtsBusy]);

  /* ------------------------------ Transcript ------------------------------ */
  function toggleBrowserSTT() {
    // Initialize the STT service on the first run
    if (!browserSttRef.current) {
      browserSttRef.current = createBrowserSTT({
        onPartial: setBrowserPartial,
        onFinal: (t) => setBrowserLines((prev) => [...prev.slice(-20), t]),
        onError: (e) => alert(e.message),
      });
    }

    const stt = browserSttRef.current;

    // Check for availability
    if (!stt || !stt.available) {
      return alert("Web Speech API is not available on this browser.");
    }

    // Attach the auto-restart handler, BUT SAFELY CHECK FOR .rec FIRST
    if ((stt as any).rec && !(stt as any).rec.onend) {
      (stt as any).rec.onend = () => {
        if ((window as any)._browserSttOn) {
          stt.start();
        }
      };
    }

    // Toggle the mic on or off
    const isOn = (window as any)._browserSttOn ?? false;
    if (!isOn) {
      stt.start();
      (window as any)._browserSttOn = true;
      setBrowserMicOn(true);
    } else {
      stt.stop();
      (window as any)._browserSttOn = false;
      setBrowserPartial("");
      setBrowserMicOn(false);
    }
  }

  async function startServerSTT() {
    if (!serverRecRef.current) {
      serverRecRef.current = createChunkRecorder((b) => sendChunkAndStore(BOARD_ID, b));
    }
    await serverRecRef.current.start();
    setServerRecording(true);
  }
  function stopServerSTT() {
    serverRecRef.current?.stop();
    setServerRecording(false);
  }

  /* ----------------------------- Export helpers --------------------------- */
  function exportTranscriptJSON() {
    if (!transcripts.length && !browserLines.length)
      return alert("No transcript to export");
    const combined = [
      ...browserLines.map((text, i) => ({ id: `b${i}`, text })),
      ...transcripts.map((t) => ({
        id: (t as any).id ?? crypto.randomUUID(),
        text: (t as any).text ?? String(t),
      })),
    ];
    const blob = new Blob([JSON.stringify(combined, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${BOARD_ID}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportTranscriptMD() {
    if (!transcripts.length && !browserLines.length)
      return alert("No transcript to export");
    const combined = [
      ...browserLines.map((text) => text),
      ...transcripts.map((t) => (t as any).text ?? String(t)),
    ];
    const md = combined.map((line, i) => `${i + 1}. ${line}`).join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${BOARD_ID}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearTranscript() {
    setTranscripts([]);
    setBrowserLines([]);
    setBrowserPartial("");
    localStorage.removeItem(`transcripts_${BOARD_ID}`);
    setStatus("Transcript cleared.");
  }

  function exportFullReport() {
    let md = "# Hackathon Session Report\n\n";
    md += "## Transcript\n";
    const combined = [
      ...browserLines.map((text, idx) => `${idx + 1}. ${text}`),
      ...transcripts.map(
        (t, i) => `${browserLines.length + i + 1}. ${(t as any).text ?? String(t)}`
      ),
    ];
    md += combined.join("\n") || "(none)";
    md += "\n\n";

    md += "## AI Summary\n";
    md += (aiOut?.summary_md || "(no summary yet)") + "\n\n";

    md += "## Workplan\n";
    if (aiOut?.workplan?.tasks?.length) {
      md += aiOut.workplan.tasks
        .map(
          (t: any) =>
            `- [${t.priority || "P1"}] **${t.title}**${
              t.owner ? ` — ${t.owner}` : ""
            }${t.eta ? ` (${t.eta})` : ""}`
        )
        .join("\n");
    } else md += "(no tasks)";
    md += "\n\n";

    md += "## Workflow Edges\n";
    if (aiOut?.workflow_edges?.length) {
      md += aiOut.workflow_edges
        .map((e: any) => `- ${e.from} → ${e.to} (${e.kind || "follows"})`)
        .join("\n");
    } else md += "(no edges)";

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `full_report_${BOARD_ID}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAttachFiles(files: FileList) {
    const arr = Array.from(files);
    for (const f of arr) {
      try {
        const text = await f.text();
        const lines = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        setBrowserLines((prev) => [...prev, ...lines].slice(-400));
      } catch (e: any) {
        pushLog(`Failed to read ${f.name}: ${e?.message || e}`);
      }
    }
  }

  /* ------------------------------- Renderers ------------------------------ */
  // Notes
  useEffect(() => {
    if (!xrRef.current) return;
    const scene = xrRef.current.scene;

    const unsub = listenNotes(BOARD_ID, (id, data, type) => {
      if (type === "removed") {
        const m = notesMap.current.get(id);
        if (m) {
          scene.remove(m);
          notesMap.current.delete(id);
          m.traverse?.((ch) => noteIdByMesh.current.delete(ch));
          noteIdByMesh.current.delete(m);
        }
        noteSizeMap.current.delete(id);
        return;
      }

      let mesh = notesMap.current.get(id);
      if (!mesh) {
        mesh = makeNoteMesh(
          data.text,
          data.color,
          data.size,
          data.votes,
          data.shape || "sticky"
        );
        notesMap.current.set(id, mesh);

        // tag whole tree for picking
        noteIdByMesh.current.set(mesh, id);
        mesh.traverse?.((ch) => noteIdByMesh.current.set(ch, id));

        scene.add(mesh);
        noteSizeMap.current.set(id, data.size);
      } else {
        (mesh as any)._noteRedraw?.(data.text, data.votes || 0);
        // sync external size changes
        const prev = noteSizeMap.current.get(id) ?? data.size;
        if (Math.abs(data.size - prev) > 1e-6) {
          const s = data.size / prev;
          mesh.scale.multiplyScalar(s);
          noteSizeMap.current.set(id, data.size);
        }
      }

      mesh.position.set(...data.pose.position);
      (mesh as any).quaternion?.set?.(...data.pose.quaternion);
    });

    return () => unsub();
  }, [xrRef.current]);

  // Edges
  useEffect(() => {
    if (!xrRef.current) return;
    const scene = xrRef.current.scene;

    const unsub = listenEdges(BOARD_ID, (id, e, type) => {
      if (type === "removed") {
        const ln = edgesMap.current.get(id);
        if (ln) {
          scene.remove(ln);
          edgesMap.current.delete(id);
        }
        return;
      }

      const a = notesMap.current.get(e.from);
      const b = notesMap.current.get(e.to);
      if (!a || !b) return;

      let ln = edgesMap.current.get(id);
      if (!ln) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          a.position.clone(),
          b.position.clone(),
        ]);
        const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
        ln = new THREE.Line(geo, mat);
        (ln as any)._update = () => {
          const arr = ln!.geometry.attributes.position.array as Float32Array;
          arr[0] = a.position.x;
          arr[1] = a.position.y;
          arr[2] = a.position.z;
          arr[3] = b.position.x;
          arr[4] = b.position.y;
          arr[5] = b.position.z;
          ln!.geometry.attributes.position.needsUpdate = true;
        };
        edgesMap.current.set(id, ln);
        scene.add(ln);
      }
      (ln as any)._update?.();
    });

    return () => unsub();
  }, [xrRef.current]);

  /* --------------------------- Pointer interactions ----------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !xrRef.current) return;

    const scene = xrRef.current;
    const getCamera = () =>
      scene?.renderer?.xr?.getCamera?.() || scene?.camera;

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitPoint = new THREE.Vector3(); // plane hit

    function setRayFromEvent(ev: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
      ray.setFromCamera(ndc, getCamera());
    }

    function pickNote(ev: PointerEvent): { obj: THREE.Object3D; id: string } | null {
      setRayFromEvent(ev);
      const objs = Array.from(notesMap.current.values());
      const hits = ray.intersectObjects(objs, true);
      if (!hits.length) return null;

      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        const id = noteIdByMesh.current.get(obj);
        if (id) return { obj, id };
        obj = obj.parent!;
      }
      return null;
    }

    function onPointerDown(ev: PointerEvent) {
      if (ev.button !== 0) return;
      (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);

      lastDown.current = { x: ev.clientX, y: ev.clientY };

      const hit = pickNote(ev);
      if (!hit) return;

      const { obj, id } = hit;

      // ALT -> resize mode
      if (ev.altKey) {
        resizingId.current = id;
        const startSize = noteSizeMap.current.get(id) ?? 0.18;
        resizeStart.current = { startSize, startY: ev.clientY };
        return;
      }

      // start drag on the board plane
      draggingId.current = id;
      setPlaneToBoard(dragPlane.current, scene);

      setRayFromEvent(ev);
      if (ray.ray.intersectPlane(dragPlane.current, hitPoint)) {
        const origin =
          (obj as any).getWorldPosition?.(new THREE.Vector3()) ||
          new THREE.Vector3();
        dragOffset.current.copy(hitPoint.sub(origin)); // pointer - note
      } else {
        dragOffset.current.set(0, 0, 0);
      }
    }

    function onPointerMove(ev: PointerEvent) {
      // RESIZE
      if (resizingId.current && resizeStart.current) {
        const id = resizingId.current;
        const mesh = id ? notesMap.current.get(id) : null;
        if (!mesh) return;

        const { startSize, startY } = resizeStart.current;
        const dy = ev.clientY - startY;
        const factor = Math.max(0.3, Math.min(3, 1 - dy * 0.01));
        const newSize = Math.max(0.06, Math.min(0.8, startSize * factor));

        const recorded = noteSizeMap.current.get(id) ?? startSize;
        const s = newSize / recorded;
        mesh.scale.set(s, s, s);

        edgesMap.current.forEach((ln: any) => ln._update?.());
        return;
      }

      // DRAG
      if (!draggingId.current) return;

      setPlaneToBoard(dragPlane.current, scene);
      setRayFromEvent(ev);
      if (!ray.ray.intersectPlane(dragPlane.current, hitPoint)) return;

      const id = draggingId.current!;
      const mesh = notesMap.current.get(id);
      if (!mesh) return;

      // final position = planeHit - initialOffset
      const p = hitPoint.clone().sub(dragOffset.current);
      mesh.position.copy(p);

      (mesh as any)._update?.();
      edgesMap.current.forEach((ln: any) => ln._update?.());
    }

    function onPointerUp(ev: PointerEvent) {
      (ev.currentTarget as HTMLElement).releasePointerCapture?.(ev.pointerId);

      // RESIZE end
      if (resizingId.current && resizeStart.current) {
        const id = resizingId.current;
        const mesh = id ? notesMap.current.get(id) : null;
        const startSize = resizeStart.current.startSize;
        resizingId.current = null;
        resizeStart.current = null;
        if (!mesh) return;

        const newSize =
          (noteSizeMap.current.get(id) ?? startSize) * mesh.scale.x;
        noteSizeMap.current.set(id, newSize);
        try {
          updateNoteSize(BOARD_ID, id, newSize);
        } catch {}
        return;
      }

      // If this was a click (no active drag), treat as vote / link
      if (!draggingId.current) {
        const res = pickNote(ev);
        if (!res) return;
        const { id } = res;
        if (!linkMode) {
          voteNote(BOARD_ID, id, 1);
        } else {
          if (!linkStartId.current) {
            linkStartId.current = id;
            setStatus("Link: pick a target note");
          } else if (linkStartId.current !== id) {
            addEdge(BOARD_ID, linkStartId.current, id);
            linkStartId.current = null;
            setStatus("Linked.");
          }
        }
        return;
      }

      // DRAG end → persist
      const id = draggingId.current;
      draggingId.current = null;

      const mesh = id ? notesMap.current.get(id) : null;
      if (!id || !mesh) return;

      const pos = (mesh as any).position;
      const quat = (mesh as any).quaternion || { x: 0, y: 0, z: 0, w: 1 };
      const pose = {
        position: [pos.x, pos.y, pos.z],
        quaternion: [quat.x, quat.y, quat.z, quat.w],
      };
      try {
        updateNotePose(BOARD_ID, id, pose);
      } catch {}
    }

    function onPointerLeave() {
      draggingId.current = null;
      resizingId.current = null;
      resizeStart.current = null;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [linkMode]);

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <>
      {/* Left panel */}
      <div className="panel">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setTab("Transcript")}
            className={tab === "Transcript" ? "primary" : ""}
          >
            Transcript
          </button>
          <button
            onClick={() => setTab("AI")}
            className={tab === "AI" ? "primary" : ""}
          >
            AI Plan
          </button>
          <button
            onClick={() => setTab("Progress")}
            className={tab === "Progress" ? "primary" : ""}
          >
            Progress
          </button>
        </div>

        {tab === "Transcript" ? (
          engine === "browser" ? (
            <>
              <b>Live Transcript</b>
              <div className="log">{browserPartial}</div>
              <hr />
              <b>Recent Lines</b>
              <div className="log">
                {browserLines.map((l, i) => (
                  <div key={i}>• {l}</div>
                ))}
                {transcripts.slice(-10).map((t, i) => (
                  <div key={i}>• {(t as any).text ?? String(t)}</div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <button onClick={exportTranscriptJSON}>Export JSON</button>
                <button onClick={exportTranscriptMD}>Export Markdown</button>
                <button onClick={clearTranscript}>Clear Transcript</button>
              </div>
            </>
          ) : (
            <>
              <b>Server Transcript (latest chunks)</b>
              <div className="log">
                {transcripts.slice(-10).map((t, i) => (
                  <div key={i}>• {(t as any).text ?? String(t)}</div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <button onClick={exportTranscriptJSON}>Export JSON</button>
                <button onClick={exportTranscriptMD}>Export Markdown</button>
                <button onClick={clearTranscript}>Clear Transcript</button>
              </div>
            </>
          )
        ) : tab === "AI" ? (
          <AISummary
            boardId={BOARD_ID}
            liveBrowserLines={browserLines}
            aiOut={aiOut || undefined}
            forcedTranscriptText={[
              ...browserLines,
              ...transcripts.map((t: any) => t?.text ?? String(t)),
            ].join(" ")}
          />
        ) : (
          <ProgressTab />
        )}
      </div>

      {/* Floating AI Console */}
      <AiConsole
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        summaryMd={aiOut?.summary_md}
        logs={logs}
        busy={aiBusy}
        onSubmitPrompt={promptPlanUpdate}
        onApplyPlan={async () => {
          try {
            if (!xrRef.current) {
              alert("Start AR / 2D first, then place the board (tap/click).");
              return;
            }
            const out = await ensureRenderableAIOut();
            pushLog(`Applying ${out.workplan.tasks.length} tasks to the wall…`);
            await applyPlanToWall(BOARD_ID, xrRef.current as any, out);
            pushLog("Applied to wall ✅");
            setStatus("Applied to wall ✅");
          } catch (e: any) {
            console.error("applyPlanToWall failed:", e);
            setStatus("Apply failed");
            alert(e?.message || "Failed to apply to wall");
          }
        }}
        onExport={exportFullReport}
        onClearApplied={() => {
          clearAppliedPlan(BOARD_ID);
          setStatus("Cleared AI notes/edges.");
          pushLog("Cleared applied plan artifacts.");
        }}
        micOn={engine === "server" ? serverRecording : browserMicOn}
        onToggleMic={() => {
          if (engine === "server") (serverRecording ? stopServerSTT() : startServerSTT());
          else toggleBrowserSTT();
        }}
        onAttachFiles={handleAttachFiles}
        startAR={startAR}
        linkMode={linkMode}
        setLinkMode={(v) => setLinkMode(v)}
        summarizeNow={summarizeNow}
        geminiKeyLoaded={hasGeminiKey()}
        clearWall={async () => {
          await clearWall(BOARD_ID);
          notesMap.current.forEach((m) => xrRef.current?.scene?.remove(m));
          edgesMap.current.forEach((ln) => xrRef.current?.scene?.remove(ln));
          notesMap.current.clear();
          edgesMap.current.clear();
          setStatus("Wall cleared.");
        }}
        engine={engine}
        setEngine={(val) => setEngine(val)}
        serverRecording={serverRecording}
        toggleSTT={() => {
          if (engine === "browser") toggleBrowserSTT();
          else (serverRecording ? stopServerSTT() : startServerSTT());
        }}
        demoMode={() => {
          setTranscripts(demoTranscripts as any);
          setAiOut(demoAI);
          setTab("AI");
          setAiOpen(true);
        }}
        uid={uid}
        onReadAloud={handleReadAloud}
        isTtsBusy={isTtsBusy}
        status={status}
      />

      {/* Note creation modal */}
      {showNoteModal && (
        <NoteModal
          onSubmit={async ({ text, color, shape }) => {
            const note: NoteDoc = {
              text,
              color,
              pose:
                pendingPose.current || {
                  position: [0, 0, 0],
                  quaternion: [0, 0, 0, 1],
                },
              size: 0.18,
              votes: 0,
              shape,
            };
            await addNote(BOARD_ID, note);
            setShowNoteModal(false);
            pendingPose.current = null;
          }}
          onCancel={() => {
            setShowNoteModal(false);
            pendingPose.current = null;
          }}
        />
      )}

      {/* AR/2D canvas */}
      <canvas ref={canvasRef} style={{ width: "100vw", height: "100vh" }} />
    </>
  );
}















// // src/App.tsx
// import { useEffect, useRef, useState, useCallback } from "react";
// import "./styles.css";

// import {
//   createBoardIfMissing,
//   addNote,
//   listenNotes,
//   voteNote,
//   addEdge,
//   listenEdges,
//   updateNotePose,
//   updateNoteSize,
// } from "./lib/db";

// import * as WebXRSceneMod from "./ar/WebXRScene";
// import { Web2DScene } from "./ar/Web2DScene";
// import { makeNoteMesh } from "./ar/NoteMesh";
// import type { NoteDoc } from "./types";
// import * as THREE from "three";

// import { applyPlanToWall } from "./lib/planApply";
// import { clearAppliedPlan } from "./lib/clearAppliedPlan";
// import { clearWall } from "./lib/clearWall";

// import { createBrowserSTT } from "./lib/stt";
// import { createChunkRecorder } from "./lib/recorder";
// import { sendChunkAndStore } from "./lib/uploadChunk";

// import ProgressTab from "./lib/ProgressTab";
// import NoteModal from "./components/NoteModal";

// import { listenTranscriptStream, TranscriptDoc } from "./lib/transcripts";
// import {
//   ensurePlanLoaded,
//   refinePlan,
//   summarizePlan,
//   hasGeminiKey,
// } from "./lib/aiPlanGemini";
// import { listenLatestAIOutput, AIOutput } from "./lib/aiOutputs";
// import AISummary from "./lib/AISummary";
// import { demoTranscripts, demoAI } from "./lib/demoData";

// /* --------------------------------- Config -------------------------------- */
// const BOARD_ID = "demo";

// function getXRSceneCtor() {
//   const mod: any = WebXRSceneMod as any;
//   return mod.WebXRScene || mod.default || mod;
// }

// type LogEntry = { ts: number; text: string };

// /* ------------------------------ AI Console UI ---------------------------- */
// function AiConsole({
//   open,
//   onClose,
//   summaryMd,
//   logs,
//   busy,
//   onSubmitPrompt,
//   onApplyPlan,
//   onExport,
//   onClearApplied,
//   micOn,
//   onToggleMic,
//   onAttachFiles,
//   startAR,
//   linkMode,
//   setLinkMode,
//   summarizeNow,
//   geminiKeyLoaded,
//   clearWall,
//   engine,
//   setEngine,
//   serverRecording,
//   toggleSTT,
//   demoMode,
//   uid,
//   status,
// }: {
//   open: boolean;
//   onClose: () => void;
//   summaryMd: string | undefined;
//   logs: LogEntry[];
//   busy: boolean;
//   onSubmitPrompt: (prompt: string) => void;
//   onApplyPlan: () => void;
//   onExport: () => void;
//   onClearApplied: () => void;
//   micOn: boolean;
//   onToggleMic: () => void;
//   onAttachFiles: (files: FileList) => void;
//   startAR: () => void;
//   linkMode: boolean;
//   setLinkMode: (v: boolean) => void;
//   summarizeNow: () => void;
//   geminiKeyLoaded: boolean;
//   clearWall: () => void;
//   engine: "browser" | "server";
//   setEngine: (e: "browser" | "server") => void;
//   serverRecording: boolean;
//   toggleSTT: () => void;
//   demoMode: () => void;
//   uid: string;
//   status: string;
// }) {
//   const [prompt, setPrompt] = useState("");
//   const fileRef = useRef<HTMLInputElement>(null);
//   const [attachedNames, setAttachedNames] = useState<string[]>([]);

//   if (!open) return null;

//   return (
//     <div
//       className="fixed bottom-20 right-4 z-50 w-[560px] max-w-[96vw] select-none"
//       role="dialog"
//       aria-label="AI Console"
//     >
//       <div
//         style={{
//           borderRadius: 20,
//           border: "1px solid #444",
//           background: "#181c24f2",
//           boxShadow: "0 8px 32px #0004",
//           padding: 24,
//           minWidth: 340,
//         }}
//       >
//         {/* Top controls row */}
//         <div
//           style={{
//             display: "flex",
//             gap: 10,
//             flexWrap: "wrap",
//             alignItems: "center",
//             marginBottom: 18,
//             justifyContent: "space-between",
//           }}
//         >
//           <div
//             style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
//           >
//             <button
//               onClick={startAR}
//               style={{
//                 padding: "8px 14px",
//                 borderRadius: 8,
//                 background: "#23272f",
//                 color: "#ffd166",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "1px solid #444",
//               }}
//             >
//               Start AR
//             </button>

//             <button
//               onClick={() => setLinkMode(!linkMode)}
//               style={{
//                 padding: "8px 14px",
//                 borderRadius: 8,
//                 background: linkMode ? "#ffd166" : "#23272f",
//                 color: linkMode ? "#23272f" : "#ffd166",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "1px solid #444",
//               }}
//             >
//               {linkMode ? "Exit Link Mode" : "Link Mode"}
//             </button>

//             <button
//               onClick={summarizeNow}
//               disabled={!geminiKeyLoaded}
//               style={{
//                 padding: "8px 14px",
//                 borderRadius: 8,
//                 background: geminiKeyLoaded ? "#6366f1" : "#23272f",
//                 color: "#fff",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "none",
//                 opacity: geminiKeyLoaded ? 1 : 0.5,
//               }}
//             >
//               Summarize Now
//             </button>

//             <button
//               onClick={clearWall}
//               style={{
//                 padding: "8px 14px",
//                 borderRadius: 8,
//                 background: "#23272f",
//                 color: "#ffd166",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "1px solid #444",
//               }}
//             >
//               Clear Wall
//             </button>

//             <button
//               onClick={toggleSTT}
//               style={{
//                 padding: "8px 14px",
//                 borderRadius: 8,
//                 background: "#23272f",
//                 color: "#ffd166",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "1px solid #444",
//               }}
//             >
//               {engine === "browser"
//                 ? "Toggle Browser STT"
//                 : serverRecording
//                 ? "Stop Mic"
//                 : "Start Mic"}
//             </button>

//             {/* Attach (hidden input) */}
//             <input
//               ref={fileRef}
//               type="file"
//               accept=".txt,.md,.json,.c,.cpp,.js,.ts,.tsx,.py"
//               multiple
//               style={{ display: "none" }}
//               onChange={(e) => {
//                 const files = e.target.files;
//                 if (files?.length) {
//                   setAttachedNames(Array.from(files).map((f) => f.name));
//                   onAttachFiles(files);
//                 }
//                 if (fileRef.current) fileRef.current.value = "";
//               }}
//             />
//             <button
//               onClick={() => fileRef.current?.click()}
//               style={{
//                 padding: "8px 14px",
//                 borderRadius: 8,
//                 background: "#23272f",
//                 color: "#ffd166",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "1px solid #444",
//               }}
//               title="Attach files"
//             >
//               Attach
//             </button>

//             <button
//               onClick={demoMode}
//               style={{
//                 padding: "8px 14px",
//                 borderRadius: 8,
//                 background: "#23272f",
//                 color: "#ffd166",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "1px solid #444",
//               }}
//             >
//               Demo Mode
//             </button>

//             {/* Attached names preview */}
//             <div
//               style={{
//                 fontSize: 12,
//                 color: "#e6eef7",
//                 maxWidth: 180,
//                 overflow: "hidden",
//                 textOverflow: "ellipsis",
//                 whiteSpace: "nowrap",
//               }}
//               title={attachedNames.join(", ")}
//             >
//               {attachedNames.join(", ")}
//             </div>
//           </div>

//           <span
//             style={{
//               fontSize: 13,
//               background: "#23272f",
//               color: geminiKeyLoaded ? "#22c55e" : "#ef4444",
//               borderRadius: 6,
//               padding: "2px 8px",
//               marginLeft: "auto",
//             }}
//           >
//             {geminiKeyLoaded ? "Gemini ✅" : "Gemini key missing ⚠️"}
//           </span>
//         </div>

//         {/* Header / Export / Hide */}
//         <div
//           style={{
//             display: "flex",
//             justifyContent: "space-between",
//             alignItems: "center",
//             marginBottom: 12,
//           }}
//         >
//           <div style={{ fontWeight: 600, fontSize: 18 }}>AI Console</div>
//           <div style={{ display: "flex", gap: 8 }}>
//             <button
//               onClick={onExport}
//               style={{
//                 fontSize: 13,
//                 padding: "4px 12px",
//                 borderRadius: 8,
//                 border: "1px solid #444",
//                 background: "#23272f",
//                 color: "#ffd166",
//               }}
//             >
//               Export
//             </button>
//             <button
//               onClick={onClose}
//               title="Hide console"
//               aria-label="Hide AI Console"
//               style={{
//                 fontSize: 13,
//                 padding: "4px 12px",
//                 borderRadius: 8,
//                 border: "1px solid #444",
//                 background: "#23272f",
//                 color: "#ffd166",
//               }}
//             >
//               ✕
//             </button>
//           </div>
//         </div>

//         {/* Summary */}
//         <div
//           style={{
//             fontSize: 15,
//             color: "#e6eef7",
//             marginBottom: 16,
//             maxHeight: 120,
//             overflow: "auto",
//             whiteSpace: "pre-wrap",
//           }}
//         >
//           {summaryMd || "(No summary yet. Click Summarize or send a prompt.)"}
//         </div>

//         {/* Logs */}
//         <div
//           style={{
//             fontSize: 12,
//             fontFamily: "monospace",
//             background: "#23272f",
//             borderRadius: 8,
//             padding: 8,
//             maxHeight: 80,
//             overflow: "auto",
//             marginBottom: 16,
//           }}
//         >
//           {logs.length === 0 ? (
//             <div style={{ opacity: 0.6 }}>[log] Console ready.</div>
//           ) : (
//             logs.slice(-60).map((l, i) => (
//               <div key={i} style={{ whiteSpace: "pre" }}>
//                 {new Date(l.ts).toLocaleTimeString()} — {l.text}
//               </div>
//             ))
//           )}
//         </div>

//         {/* Actions */}
//         <div
//           style={{
//             display: "flex",
//             gap: 8,
//             marginBottom: 16,
//             flexWrap: "wrap",
//             alignItems: "center",
//           }}
//         >
//           <button
//             onClick={onApplyPlan}
//             style={{
//               padding: "8px 18px",
//               borderRadius: 8,
//               background: "#22c55e",
//               color: "#fff",
//               fontWeight: 500,
//               fontSize: 15,
//               border: "none",
//             }}
//           >
//             Apply to Wall
//           </button>
//           <button
//             onClick={onClearApplied}
//             style={{
//               padding: "8px 18px",
//               borderRadius: 8,
//               background: "#23272f",
//               color: "#ffd166",
//               fontWeight: 500,
//               fontSize: 15,
//               border: "1px solid #444",
//             }}
//           >
//             Clear Applied
//           </button>
//         </div>

//         {/* Prompt */}
//         <form
//           onSubmit={(e) => {
//             e.preventDefault();
//             if (!prompt.trim() || busy) return;
//             onSubmitPrompt(prompt.trim());
//             setPrompt("");
//           }}
//           style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
//         >
//           <textarea
//             value={prompt}
//             onChange={(e) => setPrompt(e.target.value)}
//             placeholder="Ask AI to modify the plan (e.g., add a QA lane, reprioritize P0s)…"
//             rows={3}
//             style={{
//               flex: 1,
//               borderRadius: 8,
//               border: "1px solid #444",
//               background: "#23272f",
//               padding: "10px 14px",
//               fontSize: 15,
//               color: "#e6eef7",
//               resize: "vertical",
//             }}
//           />
//           <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
//             <button
//               type="submit"
//               disabled={busy}
//               style={{
//                 padding: "10px 18px",
//                 borderRadius: 8,
//                 background: "#6366f1",
//                 color: "#fff",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "none",
//                 opacity: busy ? 0.6 : 1,
//               }}
//             >
//               {busy ? "Thinking…" : "Send"}
//             </button>
//             <button
//               type="button"
//               onClick={() => (window as any).__setAITab?.()}
//               style={{
//                 padding: "10px 18px",
//                 borderRadius: 8,
//                 background: "#23272f",
//                 color: "#ffd166",
//                 fontWeight: 500,
//                 fontSize: 15,
//                 border: "1px solid #444",
//               }}
//             >
//               Update AI Plan
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// }

// /* ---------------------------------- App ---------------------------------- */

// export default function App() {
//   /* Canvas/Scene */
//   const canvasRef = useRef<HTMLCanvasElement | null>(null);
//   const xrRef = useRef<any>(null);

//   /* UI State */
//   const [uid] = useState("local");
//   const [status, setStatus] = useState("");
//   const [linkMode, setLinkMode] = useState(false);
//   const linkStartId = useRef<string | null>(null);

//   const [tab, setTab] = useState<"Transcript" | "AI" | "Progress">("Transcript");
//   const [aiOut, setAiOut] = useState<AIOutput | null>(null);
//   const [aiOpen, setAiOpen] = useState(true);
//   const [aiBusy, setAiBusy] = useState(false);
//   const [logs, setLogs] = useState<LogEntry[]>([]);
//   const pushLog = (text: string) => setLogs((prev) => [...prev, { ts: Date.now(), text }]);

//   /* Scene Maps */
//   const notesMap = useRef<Map<string, THREE.Object3D>>(new Map());
//   const edgesMap = useRef<Map<string, THREE.Line>>(new Map());
//   const noteIdByMesh = useRef<WeakMap<THREE.Object3D, string>>(new WeakMap());

//   /* Drag/Resize */
//   const draggingId = useRef<string | null>(null);
//   const dragPlane = useRef(new THREE.Plane());
//   const dragOffset = useRef(new THREE.Vector3());
//   const lastDown = useRef<{ x: number; y: number } | null>(null);

//   const resizingId = useRef<string | null>(null);
//   const resizeStart = useRef<{ startSize: number; startY: number } | null>(null);
//   const noteSizeMap = useRef<Map<string, number>>(new Map());

//   /* STT */
//   const [engine, setEngine] = useState<"browser" | "server">("browser");
//   const [browserPartial, setBrowserPartial] = useState("");
//   const [browserLines, setBrowserLines] = useState<string[]>([]);
//   const browserSttRef = useRef<ReturnType<typeof createBrowserSTT>>();
//   const serverRecRef = useRef<ReturnType<typeof createChunkRecorder>>();
//   const [serverRecording, setServerRecording] = useState(false);
//   const [transcripts, setTranscripts] = useState<TranscriptDoc[]>([]);
//   const [browserMicOn, setBrowserMicOn] = useState(false);

//   /* Modal */
//   const [showNoteModal, setShowNoteModal] = useState(false);
//   const pendingPose = useRef<any>(null);

//   /* ---------- helpers for dragging on the board plane (not ground) -------- */
//   const _tmpV = useRef(new THREE.Vector3()).current;
//   const _tmpQ = useRef(new THREE.Quaternion()).current;
//   const _tmpS = useRef(new THREE.Vector3()).current;

//   function getBoardObject(scene: any): THREE.Object3D | null {
//     return scene?.boardMesh || scene?.board?.mesh || scene?.board || scene?.wall || null;
//   }

//   function setPlaneToBoard(plane: THREE.Plane, scene: any) {
//     const board = getBoardObject(scene);
//     if (board && board.matrixWorld) {
//       board.updateMatrixWorld(true);
//       board.matrixWorld.decompose(_tmpV, _tmpQ, _tmpS);
//       const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(_tmpQ).normalize(); // board forward
//       plane.setFromNormalAndCoplanarPoint(normal, _tmpV.clone());
//     } else {
//       // Fallback if board hasn't been placed yet
//       plane.setFromNormalAndCoplanarPoint(
//         new THREE.Vector3(0, 1, 0),
//         new THREE.Vector3(0, 0, 0)
//       );
//     }
//   }

//   /* Init board + listeners */
//   useEffect(() => {
//     createBoardIfMissing(BOARD_ID);
//   }, []);
//   useEffect(() => listenLatestAIOutput(BOARD_ID, setAiOut), []);
//   useEffect(() => listenTranscriptStream(BOARD_ID, setTranscripts), []);

//   /* Demo mode shortcut */
//   useEffect(() => {
//     const params = new URLSearchParams(window.location.search);
//     if (params.get("demo") === "1") {
//       setTranscripts(demoTranscripts as any);
//       setAiOut(demoAI);
//       setTab("AI");
//       setAiOpen(true);
//     }
//   }, []);

//   /* Allow “Update AI Plan” button to switch to AI tab */
//   useEffect(() => {
//     (window as any).__setAITab = () => setTab("AI");
//     return () => delete (window as any).__setAITab;
//   }, []);

//   /* ----------------------------- Start AR / 2D ---------------------------- */
//   async function startAR() {
//     if (!canvasRef.current) return;

//     // Prefer WebXR if available; fall back to the 2D scene
//     const useXR = typeof (navigator as any).xr !== "undefined" && window.isSecureContext;

//     let SceneCtor: any = Web2DScene;
//     if (useXR) {
//       try {
//         const MaybeCtor = getXRSceneCtor();
//         if (typeof MaybeCtor === "function") SceneCtor = MaybeCtor;
//       } catch {
//         /* keep 2D fallback */
//       }
//     }

//     const scene = new SceneCtor(canvasRef.current);
//     xrRef.current = scene;

//     // Optional callbacks if supported by the scene
//     if ("onPlaceBoard" in scene) {
//       (scene as any).onPlaceBoard = () => setStatus("Board placed. Tap to add notes.");
//     }
//     if ("onPlaceNote" in scene) {
//       (scene as any).onPlaceNote = (pose: any) => {
//         pendingPose.current = pose;
//         setShowNoteModal(true);
//       };
//     }

//     // Try common start method names
//     const startFns = ["startAR", "start", "begin", "run", "init"] as const;
//     let started = false;
//     for (const name of startFns) {
//       const fn = (scene as any)[name];
//       if (typeof fn === "function") {
//         try {
//           const ret = fn.call(scene);
//           if (ret && typeof ret.then === "function") await ret;
//           started = true;
//           break;
//         } catch (e) {
//           console.warn(`Scene.${name} threw:`, e);
//         }
//       }
//     }

//     if (!started) {
//       alert("Unable to start the scene (no start/startAR/begin/init).");
//       return;
//     }

//     setStatus(useXR ? "Tap to place the board." : "Click to place the board.");
//   }

//   /* -------- Build AIOutput from WorkPlan (Gemini or local fallback) ------ */
//   const buildAIOutputFromPlan = useCallback(
//     async (userPrompt?: string) => {
//       const transcriptText = [
//         ...browserLines,
//         ...transcripts.map((t: any) => t?.text ?? String(t)),
//       ].join("\n");

//       let plan = await ensurePlanLoaded(transcriptText);
//       if (userPrompt && userPrompt.trim()) {
//         plan = await refinePlan({ plan, userPrompt });
//       }
//       const summary = await summarizePlan({ plan });

//       const out: AIOutput = {
//         summary_md: summary,
//         workplan: {
//           tasks: plan.steps.map((s) => ({
//             title: s.text,
//             owner: s.owner,
//             eta: s.dueDate,
//             priority: undefined,
//             lane: undefined,
//             id: s.id,
//           })),
//         },
//         workflow_edges: [],
//       };
//       return out;
//     },
//     [browserLines, transcripts]
//   );

//   function hasRenderable(out: AIOutput | null | undefined) {
//     return !!out && Array.isArray(out.workplan?.tasks) && out.workplan.tasks.length > 0;
//   }

//   async function ensureRenderableAIOut(): Promise<AIOutput> {
//     if (hasRenderable(aiOut)) return aiOut as AIOutput;

//     const built = await buildAIOutputFromPlan();
//     if (hasRenderable(built)) {
//       setAiOut(built);
//       return built;
//     }

//     setAiOut(demoAI as AIOutput);
//     return demoAI as AIOutput;
//   }

//   const summarizeNow = useCallback(async () => {
//     try {
//       setAiBusy(true);
//       setAiOpen(true);
//       pushLog("Building work plan…");
//       setStatus("Generating plan…");
//       const out = await buildAIOutputFromPlan();
//       setAiOut(out);
//       pushLog("Plan generated.");
//       setStatus("Plan generated.");
//       setTab("AI");
//     } catch (e: any) {
//       pushLog(`Error: ${e?.message || "plan failed"}`);
//       alert(e?.message || "plan failed");
//     } finally {
//       setAiBusy(false);
//     }
//   }, [buildAIOutputFromPlan]);

//   const promptPlanUpdate = useCallback(
//     async (prompt: string) => {
//       try {
//         setAiBusy(true);
//         setAiOpen(true);
//         pushLog(`➡ Prompt: ${prompt}`);
//         setStatus("AI updating plan…");
//         const out = await buildAIOutputFromPlan(prompt);
//         setAiOut(out);
//         pushLog("✅ Plan updated.");
//         setStatus("Plan updated.");
//         setTab("AI");
//       } catch (e: any) {
//         pushLog(`❌ Update failed: ${e?.message || "unknown error"}`);
//         alert(e?.message || "update failed");
//       } finally {
//         setAiBusy(false);
//       }
//     },
//     [buildAIOutputFromPlan]
//   );


//   const [isTtsBusy, setIsTtsBusy] = useState(false);
//   const handleReadAloud = useCallback(async () => {
//     if (!aiOut?.summary_md || isTtsBusy) return;

//     const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
//     const voiceId = import.meta.env.VITE_ELEVENLABS_VOICE_ID;
//     const text = aiOut.summary_md;

//     if (!apiKey || !voiceId) {
//       alert("ElevenLabs API Key or Voice ID is missing.");
//       return;
//     }

//     setIsTtsBusy(true);
//     pushLog("Generating audio…");

//     try {
//       const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
//         method: 'POST',
//         headers: {
//           'Accept': 'audio/mpeg',
//           'Content-Type': 'application/json',
//           'xi-api-key': apiKey,
//         },
//         body: JSON.stringify({
//           text: text,
//           model_id: 'eleven_monolingual_v1',
//           voice_settings: {
//             stability: 0.5,
//             similarity_boost: 0.5,
//           },
//         }),
//       });

//       if (!response.ok) {
//         throw new Error(`ElevenLabs API error: ${response.statusText}`);
//       }

//       const audioBlob = await response.blob();
//       const audioUrl = URL.createObjectURL(audioBlob);
//       const audio = new Audio(audioUrl);
//       audio.play();
//       pushLog("Audio playing.");

//     } catch (err: any) {
//       console.error("Failed to generate audio:", err);
//       alert(`Failed to generate audio: ${err.message}`);
//       pushLog(`Error generating audio: ${err.message}`);
//     } finally {
//       setIsTtsBusy(false);
//     }
//   }, [aiOut, isTtsBusy]);

//   /* ------------------------------ Transcript ------------------------------ */
//   function toggleBrowserSTT() {
//     // Initialize the STT service on the first run
//     if (!browserSttRef.current) {
//       browserSttRef.current = createBrowserSTT({
//         onPartial: setBrowserPartial,
//         onFinal: (t) => setBrowserLines((prev) => [...prev.slice(-20), t]),
//         onError: (e) => alert(e.message),
//       });
//     }

//     const stt = browserSttRef.current;

//     // Check for availability
//     if (!stt || !stt.available) {
//       return alert("Web Speech API is not available on this browser.");
//     }

//     // Attach the auto-restart handler, BUT SAFELY CHECK FOR .rec FIRST
//     if ((stt as any).rec && !(stt as any).rec.onend) {
//       (stt as any).rec.onend = () => {
//         if ((window as any)._browserSttOn) {
//           stt.start();
//         }
//       };
//     }

//     // Toggle the mic on or off
//     const isOn = (window as any)._browserSttOn ?? false;
//     if (!isOn) {
//       stt.start();
//       (window as any)._browserSttOn = true;
//       setBrowserMicOn(true);
//     } else {
//       stt.stop();
//       (window as any)._browserSttOn = false;
//       setBrowserPartial("");
//       setBrowserMicOn(false);
//     }
//   }

//   async function startServerSTT() {
//     if (!serverRecRef.current) {
//       serverRecRef.current = createChunkRecorder((b) => sendChunkAndStore(BOARD_ID, b));
//     }
//     await serverRecRef.current.start();
//     setServerRecording(true);
//   }
//   function stopServerSTT() {
//     serverRecRef.current?.stop();
//     setServerRecording(false);
//   }

//   /* ----------------------------- Export helpers --------------------------- */
//   function exportTranscriptJSON() {
//     if (!transcripts.length && !browserLines.length)
//       return alert("No transcript to export");
//     const combined = [
//       ...browserLines.map((text, i) => ({ id: `b${i}`, text })),
//       ...transcripts.map((t) => ({
//         id: (t as any).id ?? crypto.randomUUID(),
//         text: (t as any).text ?? String(t),
//       })),
//     ];
//     const blob = new Blob([JSON.stringify(combined, null, 2)], {
//       type: "application/json",
//     });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = `transcript_${BOARD_ID}.json`;
//     a.click();
//     URL.revokeObjectURL(url);
//   }

//   function exportTranscriptMD() {
//     if (!transcripts.length && !browserLines.length)
//       return alert("No transcript to export");
//     const combined = [
//       ...browserLines.map((text) => text),
//       ...transcripts.map((t) => (t as any).text ?? String(t)),
//     ];
//     const md = combined.map((line, i) => `${i + 1}. ${line}`).join("\n");
//     const blob = new Blob([md], { type: "text/markdown" });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = `transcript_${BOARD_ID}.md`;
//     a.click();
//     URL.revokeObjectURL(url);
//   }

//   function clearTranscript() {
//     setTranscripts([]);
//     setBrowserLines([]);
//     setBrowserPartial("");
//     localStorage.removeItem(`transcripts_${BOARD_ID}`);
//     setStatus("Transcript cleared.");
//   }

//   function exportFullReport() {
//     let md = "# Hackathon Session Report\n\n";
//     md += "## Transcript\n";
//     const combined = [
//       ...browserLines.map((text, idx) => `${idx + 1}. ${text}`),
//       ...transcripts.map(
//         (t, i) => `${browserLines.length + i + 1}. ${(t as any).text ?? String(t)}`
//       ),
//     ];
//     md += combined.join("\n") || "(none)";
//     md += "\n\n";

//     md += "## AI Summary\n";
//     md += (aiOut?.summary_md || "(no summary yet)") + "\n\n";

//     md += "## Workplan\n";
//     if (aiOut?.workplan?.tasks?.length) {
//       md += aiOut.workplan.tasks
//         .map(
//           (t: any) =>
//             `- [${t.priority || "P1"}] **${t.title}**${
//               t.owner ? ` — ${t.owner}` : ""
//             }${t.eta ? ` (${t.eta})` : ""}`
//         )
//         .join("\n");
//     } else md += "(no tasks)";
//     md += "\n\n";

//     md += "## Workflow Edges\n";
//     if (aiOut?.workflow_edges?.length) {
//       md += aiOut.workflow_edges
//         .map((e: any) => `- ${e.from} → ${e.to} (${e.kind || "follows"})`)
//         .join("\n");
//     } else md += "(no edges)";

//     const blob = new Blob([md], { type: "text/markdown" });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = `full_report_${BOARD_ID}.md`;
//     a.click();
//     URL.revokeObjectURL(url);
//   }

//   async function handleAttachFiles(files: FileList) {
//     const arr = Array.from(files);
//     for (const f of arr) {
//       try {
//         const text = await f.text();
//         const lines = text
//           .split(/\r?\n/)
//           .map((s) => s.trim())
//           .filter(Boolean);
//         setBrowserLines((prev) => [...prev, ...lines].slice(-400));
//       } catch (e: any) {
//         pushLog(`Failed to read ${f.name}: ${e?.message || e}`);
//       }
//     }
//   }

//   /* ------------------------------- Renderers ------------------------------ */
//   // Notes
//   useEffect(() => {
//     if (!xrRef.current) return;
//     const scene = xrRef.current.scene;

//     const unsub = listenNotes(BOARD_ID, (id, data, type) => {
//       if (type === "removed") {
//         const m = notesMap.current.get(id);
//         if (m) {
//           scene.remove(m);
//           notesMap.current.delete(id);
//           m.traverse?.((ch) => noteIdByMesh.current.delete(ch));
//           noteIdByMesh.current.delete(m);
//         }
//         noteSizeMap.current.delete(id);
//         return;
//       }

//       let mesh = notesMap.current.get(id);
//       if (!mesh) {
//         mesh = makeNoteMesh(
//           data.text,
//           data.color,
//           data.size,
//           data.votes,
//           data.shape || "sticky"
//         );
//         notesMap.current.set(id, mesh);

//         // tag whole tree for picking
//         noteIdByMesh.current.set(mesh, id);
//         mesh.traverse?.((ch) => noteIdByMesh.current.set(ch, id));

//         scene.add(mesh);
//         noteSizeMap.current.set(id, data.size);
//       } else {
//         (mesh as any)._noteRedraw?.(data.text, data.votes || 0);
//         // sync external size changes
//         const prev = noteSizeMap.current.get(id) ?? data.size;
//         if (Math.abs(data.size - prev) > 1e-6) {
//           const s = data.size / prev;
//           mesh.scale.multiplyScalar(s);
//           noteSizeMap.current.set(id, data.size);
//         }
//       }

//       mesh.position.set(...data.pose.position);
//       (mesh as any).quaternion?.set?.(...data.pose.quaternion);
//     });

//     return () => unsub();
//   }, [xrRef.current]);

//   // Edges
//   useEffect(() => {
//     if (!xrRef.current) return;
//     const scene = xrRef.current.scene;

//     const unsub = listenEdges(BOARD_ID, (id, e, type) => {
//       if (type === "removed") {
//         const ln = edgesMap.current.get(id);
//         if (ln) {
//           scene.remove(ln);
//           edgesMap.current.delete(id);
//         }
//         return;
//       }

//       const a = notesMap.current.get(e.from);
//       const b = notesMap.current.get(e.to);
//       if (!a || !b) return;

//       let ln = edgesMap.current.get(id);
//       if (!ln) {
//         const geo = new THREE.BufferGeometry().setFromPoints([
//           a.position.clone(),
//           b.position.clone(),
//         ]);
//         const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
//         ln = new THREE.Line(geo, mat);
//         (ln as any)._update = () => {
//           const arr = ln!.geometry.attributes.position.array as Float32Array;
//           arr[0] = a.position.x;
//           arr[1] = a.position.y;
//           arr[2] = a.position.z;
//           arr[3] = b.position.x;
//           arr[4] = b.position.y;
//           arr[5] = b.position.z;
//           ln!.geometry.attributes.position.needsUpdate = true;
//         };
//         edgesMap.current.set(id, ln);
//         scene.add(ln);
//       }
//       (ln as any)._update?.();
//     });

//     return () => unsub();
//   }, [xrRef.current]);

//   /* --------------------------- Pointer interactions ----------------------- */
//   useEffect(() => {
//     const canvas = canvasRef.current;
//     if (!canvas || !xrRef.current) return;

//     const scene = xrRef.current;
//     const getCamera = () =>
//       scene?.renderer?.xr?.getCamera?.() || scene?.camera;

//     const ray = new THREE.Raycaster();
//     const ndc = new THREE.Vector2();
//     const hitPoint = new THREE.Vector3(); // plane hit

//     function setRayFromEvent(ev: PointerEvent) {
//       const r = canvas.getBoundingClientRect();
//       ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
//       ndc.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
//       ray.setFromCamera(ndc, getCamera());
//     }

//     function pickNote(ev: PointerEvent): { obj: THREE.Object3D; id: string } | null {
//       setRayFromEvent(ev);
//       const objs = Array.from(notesMap.current.values());
//       const hits = ray.intersectObjects(objs, true);
//       if (!hits.length) return null;

//       let obj: THREE.Object3D | null = hits[0].object;
//       while (obj) {
//         const id = noteIdByMesh.current.get(obj);
//         if (id) return { obj, id };
//         obj = obj.parent!;
//       }
//       return null;
//     }

//     function onPointerDown(ev: PointerEvent) {
//       if (ev.button !== 0) return;
//       (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);

//       lastDown.current = { x: ev.clientX, y: ev.clientY };

//       const hit = pickNote(ev);
//       if (!hit) return;

//       const { obj, id } = hit;

//       // ALT -> resize mode
//       if (ev.altKey) {
//         resizingId.current = id;
//         const startSize = noteSizeMap.current.get(id) ?? 0.18;
//         resizeStart.current = { startSize, startY: ev.clientY };
//         return;
//       }

//       // start drag on the board plane
//       draggingId.current = id;
//       setPlaneToBoard(dragPlane.current, scene);

//       setRayFromEvent(ev);
//       if (ray.ray.intersectPlane(dragPlane.current, hitPoint)) {
//         const origin =
//           (obj as any).getWorldPosition?.(new THREE.Vector3()) ||
//           new THREE.Vector3();
//         dragOffset.current.copy(hitPoint.sub(origin)); // pointer - note
//       } else {
//         dragOffset.current.set(0, 0, 0);
//       }
//     }

//     function onPointerMove(ev: PointerEvent) {
//       // RESIZE
//       if (resizingId.current && resizeStart.current) {
//         const id = resizingId.current;
//         const mesh = id ? notesMap.current.get(id) : null;
//         if (!mesh) return;

//         const { startSize, startY } = resizeStart.current;
//         const dy = ev.clientY - startY;
//         const factor = Math.max(0.3, Math.min(3, 1 - dy * 0.01));
//         const newSize = Math.max(0.06, Math.min(0.8, startSize * factor));

//         const recorded = noteSizeMap.current.get(id) ?? startSize;
//         const s = newSize / recorded;
//         mesh.scale.set(s, s, s);

//         edgesMap.current.forEach((ln: any) => ln._update?.());
//         return;
//       }

//       // DRAG
//       if (!draggingId.current) return;

//       setPlaneToBoard(dragPlane.current, scene);
//       setRayFromEvent(ev);
//       if (!ray.ray.intersectPlane(dragPlane.current, hitPoint)) return;

//       const id = draggingId.current!;
//       const mesh = notesMap.current.get(id);
//       if (!mesh) return;

//       // final position = planeHit - initialOffset
//       const p = hitPoint.clone().sub(dragOffset.current);
//       mesh.position.copy(p);

//       (mesh as any)._update?.();
//       edgesMap.current.forEach((ln: any) => ln._update?.());
//     }

//     function onPointerUp(ev: PointerEvent) {
//       (ev.currentTarget as HTMLElement).releasePointerCapture?.(ev.pointerId);

//       // RESIZE end
//       if (resizingId.current && resizeStart.current) {
//         const id = resizingId.current;
//         const mesh = id ? notesMap.current.get(id) : null;
//         const startSize = resizeStart.current.startSize;
//         resizingId.current = null;
//         resizeStart.current = null;
//         if (!mesh) return;

//         const newSize =
//           (noteSizeMap.current.get(id) ?? startSize) * mesh.scale.x;
//         noteSizeMap.current.set(id, newSize);
//         try {
//           updateNoteSize(BOARD_ID, id, newSize);
//         } catch {}
//         return;
//       }

//       // If this was a click (no active drag), treat as vote / link
//       if (!draggingId.current) {
//         const res = pickNote(ev);
//         if (!res) return;
//         const { id } = res;
//         if (!linkMode) {
//           voteNote(BOARD_ID, id, 1);
//         } else {
//           if (!linkStartId.current) {
//             linkStartId.current = id;
//             setStatus("Link: pick a target note");
//           } else if (linkStartId.current !== id) {
//             addEdge(BOARD_ID, linkStartId.current, id);
//             linkStartId.current = null;
//             setStatus("Linked.");
//           }
//         }
//         return;
//       }

//       // DRAG end → persist
//       const id = draggingId.current;
//       draggingId.current = null;

//       const mesh = id ? notesMap.current.get(id) : null;
//       if (!id || !mesh) return;

//       const pos = (mesh as any).position;
//       const quat = (mesh as any).quaternion || { x: 0, y: 0, z: 0, w: 1 };
//       const pose = {
//         position: [pos.x, pos.y, pos.z],
//         quaternion: [quat.x, quat.y, quat.z, quat.w],
//       };
//       try {
//         updateNotePose(BOARD_ID, id, pose);
//       } catch {}
//     }

//     function onPointerLeave() {
//       draggingId.current = null;
//       resizingId.current = null;
//       resizeStart.current = null;
//     }

//     canvas.addEventListener("pointerdown", onPointerDown);
//     window.addEventListener("pointermove", onPointerMove);
//     window.addEventListener("pointerup", onPointerUp);
//     canvas.addEventListener("pointerleave", onPointerLeave);

//     return () => {
//       canvas.removeEventListener("pointerdown", onPointerDown);
//       window.removeEventListener("pointermove", onPointerMove);
//       window.removeEventListener("pointerup", onPointerUp);
//       canvas.removeEventListener("pointerleave", onPointerLeave);
//     };
//   }, [linkMode]);

//   /* ---------------------------------- UI ---------------------------------- */
//   return (
//     <>
//       {/* Left panel */}
//       <div className="panel">
//         <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
//           <button
//             onClick={() => setTab("Transcript")}
//             className={tab === "Transcript" ? "primary" : ""}
//           >
//             Transcript
//           </button>
//           <button
//             onClick={() => setTab("AI")}
//             className={tab === "AI" ? "primary" : ""}
//           >
//             AI Plan
//           </button>
//           <button
//             onClick={() => setTab("Progress")}
//             className={tab === "Progress" ? "primary" : ""}
//           >
//             Progress
//           </button>
//         </div>

//         {tab === "Transcript" ? (
//           engine === "browser" ? (
//             <>
//               <b>Live Transcript</b>
//               <div className="log">{browserPartial}</div>
//               <hr />
//               <b>Recent Lines</b>
//               <div className="log">
//                 {browserLines.map((l, i) => (
//                   <div key={i}>• {l}</div>
//                 ))}
//                 {transcripts.slice(-10).map((t, i) => (
//                   <div key={i}>• {(t as any).text ?? String(t)}</div>
//                 ))}
//               </div>
//               <div
//                 style={{
//                   display: "flex",
//                   gap: 8,
//                   marginTop: 8,
//                   flexWrap: "wrap",
//                 }}
//               >
//                 <button onClick={exportTranscriptJSON}>Export JSON</button>
//                 <button onClick={exportTranscriptMD}>Export Markdown</button>
//                 <button onClick={clearTranscript}>Clear Transcript</button>
//               </div>
//             </>
//           ) : (
//             <>
//               <b>Server Transcript (latest chunks)</b>
//               <div className="log">
//                 {transcripts.slice(-10).map((t, i) => (
//                   <div key={i}>• {(t as any).text ?? String(t)}</div>
//                 ))}
//               </div>
//               <div
//                 style={{
//                   display: "flex",
//                   gap: 8,
//                   marginTop: 8,
//                   flexWrap: "wrap",
//                 }}
//               >
//                 <button onClick={exportTranscriptJSON}>Export JSON</button>
//                 <button onClick={exportTranscriptMD}>Export Markdown</button>
//                 <button onClick={clearTranscript}>Clear Transcript</button>
//               </div>
//             </>
//           )
//         ) : tab === "AI" ? (
//           <AISummary
//             boardId={BOARD_ID}
//             liveBrowserLines={browserLines}
//             aiOut={aiOut || undefined}
//             forcedTranscriptText={[
//               ...browserLines,
//               ...transcripts.map((t: any) => t?.text ?? String(t)),
//             ].join(" ")}
//           />
//         ) : (
//           <ProgressTab />
//         )}
//       </div>

//       {/* Floating AI Console */}
//       <AiConsole
//         open={aiOpen}
//         onClose={() => setAiOpen(false)}
//         summaryMd={aiOut?.summary_md}
//         logs={logs}
//         busy={aiBusy}
//         onSubmitPrompt={promptPlanUpdate}
//         onApplyPlan={async () => {
//           try {
//             if (!xrRef.current) {
//               alert("Start AR / 2D first, then place the board (tap/click).");
//               return;
//             }
//             const out = await ensureRenderableAIOut();
//             pushLog(`Applying ${out.workplan.tasks.length} tasks to the wall…`);
//             await applyPlanToWall(BOARD_ID, xrRef.current as any, out);
//             pushLog("Applied to wall ✅");
//             setStatus("Applied to wall ✅");
//           } catch (e: any) {
//             console.error("applyPlanToWall failed:", e);
//             setStatus("Apply failed");
//             alert(e?.message || "Failed to apply to wall");
//           }
//         }}
//         onExport={exportFullReport}
//         onClearApplied={() => {
//           clearAppliedPlan(BOARD_ID);
//           setStatus("Cleared AI notes/edges.");
//           pushLog("Cleared applied plan artifacts.");
//         }}
//         micOn={engine === "server" ? serverRecording : browserMicOn}
//         onToggleMic={() => {
//           if (engine === "server") (serverRecording ? stopServerSTT() : startServerSTT());
//           else toggleBrowserSTT();
//         }}
//         onAttachFiles={handleAttachFiles}
//         startAR={startAR}
//         linkMode={linkMode}
//         setLinkMode={(v) => setLinkMode(v)}
//         summarizeNow={summarizeNow}
//         geminiKeyLoaded={hasGeminiKey()}
//         clearWall={async () => {
//           await clearWall(BOARD_ID);
//           notesMap.current.forEach((m) => xrRef.current?.scene?.remove(m));
//           edgesMap.current.forEach((ln) => xrRef.current?.scene?.remove(ln));
//           notesMap.current.clear();
//           edgesMap.current.clear();
//           setStatus("Wall cleared.");
//         }}
//         engine={engine}
//         setEngine={(val) => setEngine(val)}
//         serverRecording={serverRecording}
//         toggleSTT={() => {
//           if (engine === "browser") toggleBrowserSTT();
//           else (serverRecording ? stopServerSTT() : startServerSTT());
//         }}
//         demoMode={() => {
//           setTranscripts(demoTranscripts as any);
//           setAiOut(demoAI);
//           setTab("AI");
//           setAiOpen(true);
//         }}
//         uid={uid}
//         status={status}
//       />

//       {/* Note creation modal */}
//       {showNoteModal && (
//         <NoteModal
//           onSubmit={async ({ text, color, shape }) => {
//             const note: NoteDoc = {
//               text,
//               color,
//               pose:
//                 pendingPose.current || {
//                   position: [0, 0, 0],
//                   quaternion: [0, 0, 0, 1],
//                 },
//               size: 0.18,
//               votes: 0,
//               shape,
//             };
//             await addNote(BOARD_ID, note);
//             setShowNoteModal(false);
//             pendingPose.current = null;
//           }}
//           onCancel={() => {
//             setShowNoteModal(false);
//             pendingPose.current = null;
//           }}
//         />
//       )}

//       {/* AR/2D canvas */}
//       <canvas ref={canvasRef} style={{ width: "100vw", height: "100vh" }} />
//     </>
//   );
// }


