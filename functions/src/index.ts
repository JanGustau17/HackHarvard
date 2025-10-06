// functions/src/index.ts

/**
 * Cloud Functions (v2) for Idea Wall
 * - POST /api/transcribe  → accepts multipart audio "file", returns { text, lang, words, confidence }
 * - POST /api/ai/plan     → builds AI summary/workplan/workflow_edges and stores to Firestore
 * - GET  /api/health      → health check
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Admin once
if (!admin.apps.length) admin.initializeApp();

/* =======================================================================================
 * 1) TRANSCRIBE (stub) — multipart/form-data using Busboy + CORS
 *    Swap the stub with Deepgram/OpenAI when ready.
 * =====================================================================================*/

// Use CommonJS for these to avoid "no call signatures" TS complaints
const cors = require("cors");
const Busboy = require("busboy");
const corsHandler = cors({ origin: true });

// Helper to read multipart file -> Buffer
function readMultipartFile(req: any): Promise<{ buffer: Buffer; filename?: string; mimeType?: string }> {
  return new Promise((resolve, reject) => {
    try {
      const bb = Busboy({ headers: req.headers });
      let fileFound = false;
      const chunks: Buffer[] = [];
      let filename: string | undefined;
      let mimeType: string | undefined;

      bb.on("file", (_: any, file: NodeJS.ReadableStream, info: any) => {
        fileFound = true;
        filename = info?.filename;
        mimeType = info?.mimeType || info?.mime || info?.encoding;
        file.on("data", (d: Buffer) => chunks.push(d));
        file.on("end", () => { /* single file done */ });
      });

      bb.on("error", (e: any) => reject(e));

      bb.on("finish", () => {
        if (!fileFound) {
          reject(new Error('No file in multipart form-data (expected field name "file").'));
          return;
        }
        resolve({ buffer: Buffer.concat(chunks), filename, mimeType });
      });

      req.pipe(bb);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * POST /api/transcribe
 * Body: multipart/form-data with a "file"
 * Resp: { text, lang, words, confidence, info }
 */
export const transcribe = onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed. Use POST." });
        return;
      }
      const ct = (req.headers["content-type"] || "").toLowerCase();
      if (!ct.includes("multipart/form-data")) {
        res.status(400).json({ error: "Expected multipart/form-data." });
        return;
      }

      // Read uploaded audio
      const { buffer, filename, mimeType } = await readMultipartFile(req);

      // TODO: Replace this stub with your STT provider call.
      const fakeTranscript = {
        text: "demo transcript chunk",
        lang: "en",
        words: [] as Array<any>,
        confidence: 0.9,
        info: { filename: filename ?? null, mimeType: mimeType ?? null, bytes: buffer.length },
      };

      res.status(200).json(fakeTranscript);
    } catch (err: any) {
      console.error("transcribe error:", err);
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });
});

/* =======================================================================================
 * 2) AI PLAN — builds summary/workplan/workflow_edges and writes to Firestore
 *    POST /api/ai/plan  Body: { boardId, windowMinutes?: number }
 * =====================================================================================*/

type AIOut = {
  summary_md: string;
  bullets: string[];
  workplan: {
    tasks: Array<{
      id: string;
      title: string;
      description?: string;
      owner?: string;
      eta?: string;
      priority?: "P0" | "P1" | "P2";
      dependsOn?: string[];
    }>;
    lanes?: string[];
  };
  workflow_edges: Array<{ from: string; to: string; kind?: "blocks" | "follows" | "verifies" }>;
  confidence?: number;
};

// Helper to safely parse JSON code blocks
function safeJson<T = any>(s: string | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export const planAI = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { boardId, windowMinutes = 10 } = body;
    if (!boardId) {
      res.status(400).json({ error: "missing boardId" });
      return;
    }

    const db = getFirestore();

    // Notes (top by votes)
    const notesSnap = await db.collection(`boards/${boardId}/notes`).get();
    const notes = notesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const topNotes = notes
      .sort((a, b) => (b.votes || 0) - (a.votes || 0))
      .slice(0, 50)
      .map((n) => `- (${n.votes || 0}) ${n.text}`);

    // Edges
    const edgesSnap = await db.collection(`boards/${boardId}/edges`).get();
    const edges = edgesSnap.docs.map((d) => d.data()) as Array<{ from: string; to: string; kind?: string }>;

    // Recent transcript window
    const cutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() - windowMinutes * 60 * 1000));
    const trSnap = await db
      .collection(`boards/${boardId}/transcripts`)
      .where("startAt", ">=", cutoff)
      .orderBy("startAt", "asc")
      .get();
    const transcript = trSnap.docs
      .map((d) => (d.data().text || ""))
      .join(" ")
      .trim()
      .slice(0, 12000);

    // Prompt
    const sys = `You are a meeting analyst for hackathon brainstorming.
Return concise, specific output.
Format:
- A short markdown summary (max ~10 bullets).
- A JSON workplan with tasks[{id,title,description,owner,eta,priority,dependsOn[]}], lanes[].
- A JSON workflow_edges[{from,to,kind}].`;

    const user = `
Context:
- Board: ${boardId}
- Notes (top by votes):
${topNotes.join("\n")}
- Edges:
${edges.map((e) => `- ${e.from} -> ${e.to} (${e.kind || "follows"})`).join("\n") || "(none)"}

Recent transcript (last ~${windowMinutes}m):
"""${transcript || "(no recent transcript)"}"""

Tasks:
1) Write an executive summary in Markdown (max 10 bullets).
2) Output workplan JSON and workflow_edges JSON inside separate triple-backtick blocks.
`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "missing OPENAI_API_KEY" });
      return;
    }

    // Use fetch instead of the SDK to avoid dependency/types
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!openaiResp.ok) {
      const detail = await openaiResp.text().catch(() => "");
      res.status(502).json({ error: "openai-failed", status: openaiResp.status, detail });
      return;
    }

    const data: any = await openaiResp.json();
    const txt: string = data?.choices?.[0]?.message?.content || "";

    // Extract JSON code blocks and summary
    const matches = Array.from(txt.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) as RegExpMatchArray[];
    const codeBlocks = matches.map((m) => m[1] as string);
    const summary_md = txt.replace(/```[\s\S]*?```/g, "").trim();

    const workplan = safeJson<AIOut["workplan"]>(codeBlocks[0], { tasks: [], lanes: [] });
    const workflow_edges = safeJson<AIOut["workflow_edges"]>(codeBlocks[1], []);

    const out: AIOut = {
      summary_md,
      bullets: [],
      workplan,
      workflow_edges,
      confidence: 0.9,
    };

    // Write to Firestore
    await db.collection(`boards/${boardId}/ai_outputs`).add({
      ...out,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json(out);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "plan-failed" });
  }
});

/* =======================================================================================
 * 3) HEALTH CHECK
 * =====================================================================================*/
export const health = onRequest(async (_req, res) => {
  res.status(200).json({ ok: true, service: "functions", ts: Date.now() });
});
