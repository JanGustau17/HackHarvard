// src/lib/aiPlanGemini.ts
// Helper utilities to generate, refine, and summarize a WorkPlan using Gemini.
// Falls back to local transforms if no API key is present.

export type PlanStep = {
  id: string;
  text: string;
  status?: "todo" | "doing" | "done";
  owner?: string;
  dueDate?: string; // ISO date
  notes?: string;
};

export type WorkPlan = {
  title: string;
  steps: PlanStep[];
  updatedAt: string; // ISO timestamp
  summary?: string;
  version?: number;
};

/* -------------------------------- Consts -------------------------------- */

export const GEMINI_MODEL = "gemini-flash-latest";
export const GEMINI_API_KEY: string = import.meta.env.VITE_GEMINI_API_KEY || "";

console.log("Vite sees this key:", GEMINI_API_KEY); 

const LS_KEY = "socialar.workplan.v1";

export const hasGeminiKey = () => !!GEMINI_API_KEY;

/* ----------------------------- Local Storage ----------------------------- */

export function savePlanToLocalStorage(plan: WorkPlan) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(plan));
  } catch {
    /* ignore quota / privacy mode errors */
  }
}

export function loadPlanFromLocalStorage(): WorkPlan | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as WorkPlan) : null;
  } catch {
    return null;
  }
}

/* --------------------------------- Gemini -------------------------------- */

type GenerateOptions = {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

/**
 * Calls Gemini and returns the primary text string (or empty string).
 * If no API key is configured, returns "" so callers can use a fallback.
 * No alerts or UI side-effects here.
 */
async function callGemini(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  if (!hasGeminiKey()) return "";

  const {
    system,
    temperature = 0.4,
    maxOutputTokens = 2048,
    timeoutMs = 25_000,
  } = opts;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
    GEMINI_API_KEY
  )}`;

  const body = {
    contents: [
      ...(system
        ? [
            {
              role: "user",
              parts: [{ text: `System directive:\n${system}` }],
            },
          ]
        : []),
      { role: "user", parts: [{ text: prompt }] },
    ],
    generationConfig: { temperature, maxOutputTokens },
  };

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      try {
        const t = await res.text();
        console.warn("Gemini HTTP error", res.status, t);
      } catch {
        console.warn("Gemini HTTP error", res.status);
      }
      return "";
    }

    const data = (await res.json()) as any;
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("")
        ?.trim() ?? "";
    return text;
  } catch (err) {
    console.warn("Gemini request failed:", err);
    return "";
  } finally {
    clearTimeout(to);
  }
}

/* ---------------------------- Prompt Templates --------------------------- */

const SYSTEM_DIRECTIVE = `You are an assistant for a "Work Plan" UI.
Always return concise JSON when asked to (no prose before or after).
The JSON schema is:
{
  "title": string,
  "steps": [{ "id": string, "text": string, "status": "todo"|"doing"|"done"?, "owner"?: string, "dueDate"?: string, "notes"?: string }],
  "summary": string
}
Prefer 5–10 clear steps. Where the user asks for edits, minimally update the plan.`;

// Only include portable parts for LLM context
function planToJSON(plan: WorkPlan): string {
  return JSON.stringify(
    {
      title: plan.title,
      steps: plan.steps,
      summary: plan.summary ?? "",
    },
    null,
    2
  );
}

function stripJSONFence(s: string): string {
  // Handles ```json ... ``` or ``` ... ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const m = s.match(fence);
  return m ? m[1].trim() : s.trim();
}

function safeParseJSON<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/* ---------------------------- Public Functions --------------------------- */

/**
 * Create a new plan from a transcript or rough notes.
 * Uses Gemini when available; otherwise builds a simple plan locally.
 */
export async function createPlanFromTranscript(transcript: string): Promise<WorkPlan> {
  const prompt = `Create a focused WorkPlan JSON from this transcript/notes:\n\n${transcript}\n\nReturn only JSON (no commentary).`;
  const text = await callGemini(prompt, { system: SYSTEM_DIRECTIVE });

  const parsed =
    safeParseJSON<{ title: string; steps: PlanStep[]; summary?: string }>(stripJSONFence(text)) ||
    // Fallback: trivial plan from bullet heuristics
    fallbackPlanFromTranscript(transcript);

  const plan: WorkPlan = {
    title: parsed.title || "AI Work Plan",
    steps: (parsed.steps ?? []).map(normalizeStep),
    summary: parsed.summary ?? quickSummaryFromSteps(parsed.steps ?? []),
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  savePlanToLocalStorage(plan);
  return plan;
}

/**
 * Refine the existing plan based on a user prompt ("add X", "remove Y", etc.).
 * Returns the updated plan. Falls back to local summary if LLM output is empty.
 */
export async function refinePlan(args: {
  plan: WorkPlan;
  userPrompt: string;
}): Promise<WorkPlan> {
  const { plan, userPrompt } = args;

  const prompt = `You are editing an existing WorkPlan. Current plan JSON:\n${planToJSON(
    plan
  )}\n\nUser request:\n"${userPrompt}"\n\nApply the changes and return the full updated plan JSON (no commentary).`;

  const text = await callGemini(prompt, { system: SYSTEM_DIRECTIVE });

  const parsed =
    safeParseJSON<{ title?: string; steps?: PlanStep[]; summary?: string }>(
      stripJSONFence(text)
    ) || null;

  const updated: WorkPlan = {
    title: parsed?.title || plan.title,
    steps: (parsed?.steps ?? plan.steps).map(normalizeStep),
    summary: parsed?.summary ?? (await summarizePlan({ plan, forceLocal: !parsed })),
    updatedAt: new Date().toISOString(),
    version: (plan.version ?? 1) + 1,
  };

  savePlanToLocalStorage(updated);
  return updated;
}

/**
 * Summarize a plan (1–3 sentences). Falls back to local heuristic when no key
 * or when the request fails/returns empty.
 */
export async function summarizePlan(args: {
  plan: WorkPlan;
  forceLocal?: boolean;
}): Promise<string> {
  const { plan, forceLocal } = args;

  if (forceLocal || !hasGeminiKey()) {
    return quickSummaryFromSteps(plan.steps);
  }

  const prompt = `Summarize this plan in 1–3 crisp sentences for a sidebar UI:\n${planToJSON(
    plan
  )}\n\nReturn just the summary text.`;
  const text = (await callGemini(prompt)) || quickSummaryFromSteps(plan.steps);
  return text.replace(/\n+/g, " ").trim();
}

/* -------------------------------- Fallbacks ------------------------------ */

function fallbackPlanFromTranscript(transcript: string) {
  const bullets =
    transcript
      .split(/\n|•|-/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 8) || [];

  return {
    title: "Draft Plan",
    steps: bullets.map((b, i) => ({
      id: `s${i + 1}`,
      text: b,
      status: "todo" as const,
    })),
    summary: quickSummaryFromSteps(
      bullets.map((b, i) => ({ id: `s${i + 1}`, text: b, status: "todo" as const }))
    ),
  };
}

function normalizeStep(s: PlanStep, idx?: number): PlanStep {
  return {
    id: s.id || `s${(idx ?? 0) + 1}-${Math.random().toString(36).slice(2, 6)}`,
    text: (s.text ?? "").toString().trim() || "Untitled step",
    status: s.status ?? "todo",
    owner: s.owner?.trim() || undefined,
    dueDate: s.dueDate || undefined,
    notes: s.notes?.trim() || undefined,
  };
}

function quickSummaryFromSteps(steps: Array<Pick<PlanStep, "text" | "status">>): string {
  if (!steps?.length) return "No steps yet. Add tasks to build the plan.";
  const done = steps.filter((s) => s.status === "done").length;
  const doing = steps.filter((s) => s.status === "doing").length;
  const todo = steps.length - done - doing;
  const firstThree = steps
    .slice(0, 3)
    .map((s) => s.text.replace(/\.$/, ""))
    .join("; ");
  return `${steps.length} steps — ${done} done, ${doing} in progress, ${todo} to-do. Focus: ${firstThree}${
    steps.length > 3 ? ", …" : "."
  }`;
}

/* ---------------------------- Convenience Exports ------------------------ */

/**
 * Ensures a plan exists (from local storage if available). If none exists,
 * creates a new one using the transcript (LLM-backed if key present).
 */
export async function ensurePlanLoaded(transcriptIfNew?: string): Promise<WorkPlan> {
  const existing = loadPlanFromLocalStorage();
  if (existing) return existing;

  if (transcriptIfNew) return createPlanFromTranscript(transcriptIfNew);

  const empty: WorkPlan = {
    title: "New Work Plan",
    steps: [],
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  savePlanToLocalStorage(empty);
  return empty;
}
