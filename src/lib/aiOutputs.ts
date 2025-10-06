// src/lib/aiOutputs.ts
// Minimal AI output model + local listener utilities.
// Works without a backend (uses localStorage + a small event bus).

/* =========================
 * Types
 * ========================= */

export type AITask = {
  title: string;
  priority?: string;   // e.g., "P0" | "P1"
  owner?: string;      // display name
  eta?: string;        // freeform, e.g., "2d", "by Friday"
  lane?: string;       // e.g., "Frontend" | "Backend" | "AI"
  id?: string;         // optional stable id if you have one
};

export type AIWorkflowEdge = {
  from: string;        // task title or id
  to: string;          // task title or id
  kind?: string;       // e.g., "follows" | "blocks" | "enables"
};

export type AIOutput = {
  summary_md: string;
  workplan: { tasks: AITask[] };
  workflow_edges: AIWorkflowEdge[];
};

/* =========================
 * Helpers
 * ========================= */

const LS_KEY = (boardId: string) => `socialar.ai_output.${boardId}`;

function isObj(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object";
}

function toArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Normalize whatever came back from an LLM / backend into AIOutput.
 * Keeps unknown fields out so the rest of the app can rely on shape.
 */
export function normalizeAIOutput(raw: any): AIOutput {
  const tasks = toArray(raw?.workplan?.tasks).map((t: any) => ({
    title: String(t?.title ?? "").trim(),
    priority: t?.priority ? String(t.priority) : undefined,
    owner: t?.owner ? String(t.owner) : undefined,
    eta: t?.eta ? String(t.eta) : undefined,
    lane: t?.lane ? String(t.lane) : undefined,
    id: t?.id ? String(t.id) : undefined,
  })).filter((t: AITask) => t.title.length > 0);

  const edges = toArray(raw?.workflow_edges).map((e: any) => ({
    from: String(e?.from ?? "").trim(),
    to: String(e?.to ?? "").trim(),
    kind: e?.kind ? String(e.kind) : undefined,
  })).filter((e: AIWorkflowEdge) => e.from.length > 0 && e.to.length > 0);

  return {
    summary_md: String(raw?.summary_md ?? ""),
    workplan: { tasks },
    workflow_edges: edges,
  };
}

/* =========================
 * Read / Write (local)
 * ========================= */

export function readAIOutput(boardId: string): AIOutput | null {
  try {
    const raw = localStorage.getItem(LS_KEY(boardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeAIOutput(parsed);
  } catch {
    return null;
  }
}

export function writeAIOutput(boardId: string, out: AIOutput) {
  try {
    localStorage.setItem(LS_KEY(boardId), JSON.stringify(out));
  } catch {
    /* ignore quota/privacy errors */
  }
  // Notify local listeners (same-tab)
  const ev = new CustomEvent("ai_output_updated", { detail: { boardId } });
  window.dispatchEvent(ev);
}

/* =========================
 * Live listener
 * ========================= */

/**
 * Subscribe to the latest AI output for a board.
 * - Immediately calls `cb` with the current value (if any).
 * - Listens to both cross-tab changes (storage) and same-tab updates (custom event).
 * - Returns an unsubscribe function.
 *
 * If you later add Firestore/DB support, replace the internals of this function
 * with your onSnapshot() and keep the signature.
 */
export function listenLatestAIOutput(
  boardId: string,
  cb: (out: AIOutput | null) => void
): () => void {
  // 1) Initial load
  cb(readAIOutput(boardId));

  // 2) Cross-tab updates
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY(boardId)) {
      cb(readAIOutput(boardId));
    }
  };

  // 3) Same-tab updates via our small event bus
  const onLocal = (e: Event) => {
    const ev = e as CustomEvent<{ boardId: string }>;
    if (isObj(ev.detail) && ev.detail.boardId === boardId) {
      cb(readAIOutput(boardId));
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("ai_output_updated", onLocal as EventListener);

  // Unsubscribe
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("ai_output_updated", onLocal as EventListener);
  };
}

/* =========================
 * Convenience (optional)
 * ========================= */

/**
 * Useful for tests/demos: save & broadcast an output in one call.
 */
export function setAIOutput(boardId: string, raw: any) {
  const normalized = normalizeAIOutput(raw);
  writeAIOutput(boardId, normalized);
  return normalized;
}
