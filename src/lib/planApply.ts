// src/lib/planApply.ts
import * as THREE from "three";
import { addNote, addEdge } from "./db";
import type { AIOutput } from "./aiPlan";
import type { NoteDoc } from "../types";

/**
 * Apply the AI plan to the AR/2D wall with lane columns.
 * - Lays out tasks in columns by lane
 * - Colors per lane
 * - Draws dependency edges
 *
 * Assumptions:
 * - xr.scene exists
 * - xr.boardMesh (or .boardAnchor) exists with world position/quaternion
 */
export async function applyPlanToWall(
  boardId: string,
  xr: any,
  aiOut: AIOutput,
  opts?: {
    spacingX?: number;      // horizontal spacing between lanes (meters)
    spacingY?: number;      // vertical spacing between task rows (meters)
    noteSize?: number;      // size of sticky
    startX?: number;        // leftmost lane offset in board-local space
    startY?: number;        // top row offset in board-local space
    colorByLane?: Record<string, string>;
    maxPerLane?: number;    // cap tasks per lane for a tidy board
  }
) {
  if (!aiOut || !aiOut.workplan || !aiOut.workplan.tasks || !aiOut.workplan.tasks.length) {
    throw new Error("No tasks to apply.");
  }
  const board = (xr as any).boardMesh || (xr as any).boardAnchor;
  if (!board) throw new Error("Board not placed yet.");

  // Defaults
  const spacingX = opts?.spacingX ?? 0.28;
  const spacingY = opts?.spacingY ?? 0.20;
  const noteSize = opts?.noteSize ?? 0.18;
  const startX   = opts?.startX ?? -0.6;   // left
  const startY   = opts?.startY ??  0.35;  // top
  const cap      = opts?.maxPerLane ?? 8;

  // Colors by lane (fallback rotates palette)
  const palette = ["#FFD966","#A7F3D0","#93C5FD","#FCA5A5","#FBCFE8","#FDE68A","#C7D2FE","#D1FAE5"];
  const colorByLane = { ...(opts?.colorByLane || {}) };
  const lanes = (aiOut.workplan.lanes && aiOut.workplan.lanes.length)
    ? aiOut.workplan.lanes
    : ["Tasks"];

  // Assign palette to lanes if not provided
  lanes.forEach((lane, i) => {
    if (!colorByLane[lane]) colorByLane[lane] = palette[i % palette.length];
  });

  // Build lane -> tasks map (respect cap for tidiness)
  const byLane: Record<string, NonNullable<AIOutput["workplan"]["tasks"]>> = {};
  lanes.forEach(l => (byLane[l] = []));
  for (const t of (aiOut.workplan.tasks || [])) {
    const lane = t.lane && lanes.includes(t.lane) ? t.lane : lanes[0];
    if ((byLane[lane].length || 0) < cap) byLane[lane].push(t);
  }

  // World transform helpers
  const bPos = new THREE.Vector3();
  const bQuat = new THREE.Quaternion();
  const bScale = new THREE.Vector3(1,1,1);
  (board as THREE.Object3D).matrixWorld.decompose(bPos, bQuat, bScale);

  function boardLocalToWorld(local: THREE.Vector3): THREE.Vector3 {
    const v = local.clone().applyQuaternion(bQuat).add(bPos);
    return v;
  }

  // Place lane headers (small “lane title” stickies)
  const headerColor = "#111827";
  const headerTextColor = "#ffffff";

  // Keep mapping from task title/id to created Firestore doc IDs so we can wire edges
  const idByTaskKey = new Map<string, string>();

  // Create notes per lane
  for (let lx = 0; lx < lanes.length; lx++) {
    const lane = lanes[lx];
    const tasks = byLane[lane];

    // Header at row 0
    await placeNote({
      boardId,
      title: `🗂 ${lane}`,
      color: headerColor,
      textColor: headerTextColor,
      x: startX + lx * spacingX,
      y: startY,
      z: 0,
      noteSize: noteSize * 0.75,
      b2w: boardLocalToWorld,
      aiGenerated: true,
    });

    // Tasks rows start after header
    for (let r = 0; r < tasks.length; r++) {
      const t = tasks[r];
      const title = summarizeTaskTitle(t.title, t.priority, t.owner, t.eta);
      const color = colorByLane[lane];

      const id = await placeNote({
        boardId,
        title,
        detail: t.description,
        color,
        x: startX + lx * spacingX,
        y: startY - (r + 1) * spacingY,
        z: 0,
        noteSize,
        b2w: boardLocalToWorld,
        aiGenerated: true,
      });

      // Key by id or title (prefer id)
      const key = t.id || t.title;
      idByTaskKey.set(key, id);
    }
  }

  // Edges (dependencies)
  if (aiOut.workflow_edges && aiOut.workflow_edges.length) {
    for (const e of aiOut.workflow_edges) {
      const fromId = idByTaskKey.get(e.from) || idByTaskKey.get(normalizeKey(e.from));
      const toId   = idByTaskKey.get(e.to)   || idByTaskKey.get(normalizeKey(e.to));
      if (fromId && toId && fromId !== toId) {
        await addEdge(boardId, fromId, toId, { aiGenerated: true });
      }
    }
  }
}

/** Create a note on the board at board-local (x,y,z) by converting to world space. */
async function placeNote(args: {
  boardId: string;
  title: string;
  detail?: string;
  color: string;
  textColor?: string;
  x: number; y: number; z: number;
  noteSize: number;
  b2w: (v: THREE.Vector3) => THREE.Vector3;
  aiGenerated?: boolean;
}): Promise<string> {
  const { boardId, title, detail, color, textColor, x, y, z, noteSize, b2w, aiGenerated } = args;
  const posW = b2w(new THREE.Vector3(x, y, z));
  const q = new THREE.Quaternion();

  const text = detail ? `${title}\n${detail}` : title;
  const note: NoteDoc = {
    text,
    color,
    pose: {
      position: [posW.x, posW.y, posW.z],
      quaternion: [q.x, q.y, q.z, q.w],
    },
    size: noteSize,
    votes: 0,
    aiGenerated: !!aiGenerated,
  };

  const id = await addNote(boardId, note);
  return id;
}

function summarizeTaskTitle(
  title?: string,
  priority: string = "P1",
  owner?: string,
  eta?: string
) {
  const own = owner ? ` — ${owner}` : "";
  const when = eta ? ` (${eta})` : "";
  return `[${priority}] ${title || "Task"}${own}${when}`;
}

function normalizeKey(s: string) {
  return (s || "").trim();
}
