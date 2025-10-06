// src/lib/startAR.ts
// One-shot AR/2D boot with safe fallback + typed handle.

import * as WebXRSceneMod from "../ar/WebXRScene";
import { Web2DScene } from "../ar/Web2DScene";

export type StartAROptions = {
  canvas: HTMLCanvasElement;
  setStatus?: (text: string) => void;
  onPlaceBoard?: () => void;
  onPlaceNote?: (pose: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
  }) => void;
};

export type ARHandle = {
  /** Underlying scene instance (WebXRScene or Web2DScene) */
  scene: any;
  /** Three.js renderer if exposed by the scene (optional) */
  renderer?: any;
  /** True if running in WebXR mode */
  isXR: boolean;
  /** Stop/teardown (no-op if the scene doesn't expose a stop method) */
  stop: () => void;
};

function getXRSceneCtor() {
  const mod: any = WebXRSceneMod as any;
  // Support default or named export
  return mod.WebXRScene || mod.default || mod;
}

/** Quick predicate you can use elsewhere if needed */
export function isXRAvailable() {
  return typeof (navigator as any).xr !== "undefined" && window.isSecureContext;
}

/**
 * Boot the shared scene. Uses WebXR on capable devices, otherwise falls back to 2D.
 * Returns an ARHandle with a stop() you can call on unmount.
 */
export async function startAR(opts: StartAROptions): Promise<ARHandle> {
  const { canvas, setStatus, onPlaceBoard, onPlaceNote } = opts;
  if (!canvas) throw new Error("startAR: canvas is required");

  // Decide XR vs 2D
  const useXR = isXRAvailable();
  let SceneCtor: any = Web2DScene;
  if (useXR) {
    try {
      const MaybeCtor = getXRSceneCtor();
      if (typeof MaybeCtor === "function") SceneCtor = MaybeCtor;
    } catch {
      // If the XR scene fails to load for any reason, keep the 2D fallback
      SceneCtor = Web2DScene;
    }
  }

  // Create scene
  const scene = new SceneCtor(canvas);

  // Wire optional callbacks if scene supports them
  if (onPlaceBoard) (scene as any).onPlaceBoard = () => onPlaceBoard();
  if (onPlaceNote) (scene as any).onPlaceNote = (pose: any) => onPlaceNote(pose);

  // Start it
  try {
    await scene.startAR();
    setStatus?.(useXR ? "Tap to place the board." : "Click to place the board.");
  } catch (e: any) {
    setStatus?.("Failed to start AR scene.");
    throw new Error(e?.message || "Failed to start AR/2D scene");
  }

  // Build handle
  const handle: ARHandle = {
    scene,
    renderer: (scene as any).renderer,
    isXR: !!useXR,
    stop: () => {
      try {
        if (typeof (scene as any).stopAR === "function") (scene as any).stopAR();
        else if (typeof (scene as any).dispose === "function") (scene as any).dispose();
      } catch {
        /* noop */
      }
    },
  };

  return handle;
}
