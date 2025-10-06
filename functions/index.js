// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const formidable = require('formidable');
const fs = require('fs');

admin.initializeApp();

// Use Node 18 global fetch, or fallback to node-fetch if missing
const ensureFetch = async () => {
  if (typeof fetch === 'function') return fetch;
  const { default: nf } = await import('node-fetch');
  return nf;
};

// --- Helpers ---
function sendCORS(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handleOptions(req, res) {
  sendCORS(res);
  return res.status(204).send('');
}

// ======================= TRANSCRIBE (Deepgram) =======================
exports.transcribe = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    try {
      sendCORS(res);
      if (req.method === 'OPTIONS') return handleOptions(req, res);
      if (req.method !== 'POST') return res.status(405).send('POST only');

      const maxFileSize = (Number(process.env.MAX_UPLOAD_MB || 25)) * 1024 * 1024;
      const form = formidable({ multiples: false, maxFileSize });

      form.parse(req, async (err, fields, files) => {
        if (err) return res.status(400).json({ error: err.message });

        const f = files.file || Object.values(files)[0];
        if (!f) return res.status(400).json({ error: 'no-file' });

        const mimetype = f.mimetype || 'audio/webm'; // Deepgram: webm/ogg/wav/m4a/mp3
        const apiKey =
          process.env.DEEPGRAM_API_KEY ||
          (functions.config().deepgram && functions.config().deepgram.key);
        if (!apiKey) return res.status(500).json({ error: 'missing-deepgram-key' });

        // Read uploaded file
        const data = await fs.promises.readFile(f.filepath);

        // Build Deepgram request
        const params = new URLSearchParams({
          model: 'nova-2',
          smart_format: 'true',
          punctuate: 'true',
          diarize: 'true',
          paragraphs: 'true',
          // language: 'en', // optional: set to lock language
        });

        const _fetch = await ensureFetch();
        const dgResp = await _fetch(`https://api.deepgram.com/v1/listen?${params}`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': mimetype,
          },
          body: data
        });

        if (!dgResp.ok) {
          const errTxt = await dgResp.text().catch(() => '');
          // Cleanup temp file
          fs.unlink(f.filepath, () => {});
          return res.status(502).json({ error: 'deepgram-failed', status: dgResp.status, detail: errTxt });
        }

        const j = await dgResp.json();

        // Normalize fields
        const alt = j?.results?.channels?.[0]?.alternatives?.[0] || {};
        const transcript = alt.transcript || '';
        const words = alt.words || []; // [{ word, start, end, confidence }]
        const lang = alt.language || j?.metadata?.detected_language || 'en';
        const confidence = typeof alt.confidence === 'number' ? alt.confidence : 0.9;

        // Cleanup temp file
        fs.unlink(f.filepath, () => {});

        return res.json({ text: transcript, lang, words, confidence });
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'transcribe-failed', detail: e?.message || String(e) });
    }
  });

// ======================= AI PLAN (OpenAI) ============================
/*
  POST /api/ai/plan
  Body: { boardId: string, windowMinutes?: number }
  Reads: boards/{boardId}/notes, /edges, /transcripts (recent window)
  Writes: boards/{boardId}/ai_outputs/{autoId}
*/
exports.planAI = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    try {
      sendCORS(res);
      if (req.method === 'OPTIONS') return handleOptions(req, res);
      if (req.method !== 'POST') return res.status(405).send('POST only');

      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { boardId, windowMinutes } = body || {};
      if (!boardId) return res.status(400).json({ error: 'missing boardId' });

      const winMin = Number(windowMinutes || process.env.PLAN_WINDOW_MINUTES || 10);
      const db = admin.firestore();

      // Pull notes, edges, and transcript window
      const now = Date.now();
      const since = new Date(now - winMin * 60 * 1000);

      const [notesSnap, edgesSnap, txSnap] = await Promise.all([
        db.collection(`boards/${boardId}/notes`).get(),
        db.collection(`boards/${boardId}/edges`).get(),
        db.collection(`boards/${boardId}/transcripts`)
          .where('startAt', '>=', since).orderBy('startAt', 'asc').get(),
      ]);

      const notes = [];
      notesSnap.forEach(d => notes.push({ id: d.id, ...d.data() }));
      const maxNotes = Number(process.env.PLAN_MAX_NOTES || 50);
      notes.sort((a,b) => (b.votes||0) - (a.votes||0));
      const notesTop = notes.slice(0, maxNotes);

      const edges = [];
      edgesSnap.forEach(d => edges.push({ id: d.id, ...d.data() }));

      const transcript = txSnap.docs
        .map(d => (d.data().text || '').trim())
        .filter(Boolean)
        .join('\n');

      const prompt = buildPlanPrompt({ notes: notesTop, edges, transcript, windowMinutes: winMin });

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'missing OPENAI_API_KEY' });

      const _fetch = await ensureFetch();
      const oaResp = await _fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!oaResp.ok) {
        const txt = await oaResp.text().catch(()=> '');
        return res.status(502).json({ error: 'openai-failed', detail: txt });
      }

      const json = await oaResp.json();
      const content = json.choices?.[0]?.message?.content || '';

      const { summaryMd, bullets, workplan, workflow_edges } = parsePlanOutput(content);

      const out = {
        summary_md: summaryMd,
        bullets,
        workplan,
        workflow_edges,
        confidence: 0.9,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const ref = await db.collection(`boards/${boardId}/ai_outputs`).add(out);
      return res.json({ id: ref.id, ...out });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'plan-failed', detail: e?.message || String(e) });
    }
  });

// --------- Plan helpers ---------
const SYSTEM_PROMPT = `
You are a meeting analyst for a hackathon brainstorming session.
Input = sticky notes (top by votes) + explicit links + recent transcript window.
Output:
1) Executive summary (markdown, 6–10 bullets and one short paragraph).
2) JSON workplan: { tasks:[{id,title,description,owner?,eta?,priority?,dependsOn?[]}], lanes?[] }
3) JSON workflow_edges: [{from,to,kind}] with kind in ["blocks","follows","verifies"].
Keep things concise and specific for a 24–72h plan.
`;

function buildPlanPrompt({ notes, edges, transcript, windowMinutes }) {
  const noteLines = (notes || []).map(n => `- (${n.votes||0}★) ${n.text}`).join('\n');
  const edgeLines = (edges || []).map(e => `- ${e.from} -> ${e.to} (${e.weight||1})`).join('\n');
  const tx = transcript || '(no recent transcript)';
  return `
Context:
Notes (top by votes):
${noteLines || '(none)'}
Edges:
${edgeLines || '(none)'}
Recent transcript (last ~${windowMinutes} min):
"""
${tx}
"""

Tasks:
1) Write a concise executive summary (markdown).
2) Produce \`\`\`json\`\`\` workplan as described.
3) Produce \`\`\`json\`\`\` workflow_edges as described.
Return both JSON objects in separate triple backtick blocks.
`;
}

function parsePlanOutput(content) {
  const codeBlocks = Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)).map(m => m[1]);
  let workplan = null, workflow_edges = null;

  if (codeBlocks.length >= 1) {
    try { workplan = JSON.parse(codeBlocks[0]); } catch {}
  }
  if (codeBlocks.length >= 2) {
    try {
      const second = JSON.parse(codeBlocks[1]);
      workflow_edges = Array.isArray(second) ? second : (second.workflow_edges || null);
    } catch {}
  }

  const stripped = content.replace(/```[\s\S]*?```/g, '').trim();
  const lines = stripped.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => l.startsWith('- ') || l.startsWith('* ')).slice(0, 12);
  const summaryMd = stripped;

  return { summaryMd, bullets, workplan, workflow_edges };
}
