// src/ar/NoteMesh.ts
import * as THREE from "three";

/**
 * Creates a note mesh with a geometry based on `shape`, a solid color fill,
 * and a canvas-text sprite overlay that shows the note text (and votes).
 *
 * The mesh exposes a helper:
 * (mesh as any)._noteRedraw(nextText: string, nextVotes: number)
 * so callers (your listeners) can update the label without rebuilding geometry.
 */
export function makeNoteMesh(
  text: string,
  color: string,
  size: number = 0.18,
  votes: number = 0,
  shape: "sticky" | "circle" | "diamond" | "hex" | "star" = "sticky"
): THREE.Mesh {
  // ----- Geometry by shape -----
  let geom: THREE.BufferGeometry;

  switch (shape) {
    case "circle":
      geom = new THREE.CircleGeometry(size * 0.9, 32);
      break;

    case "diamond": {
      const g = new THREE.PlaneGeometry(size, size);
      g.rotateZ(Math.PI / 4);
      geom = g;
      break;
    }

    case "hex":
      geom = new THREE.CircleGeometry(size * 0.95, 6);
      break;

    case "star": {
      // 5-point star made from a THREE.Shape
      const outer = size * 0.95;
      const inner = outer * 0.45;
      const spikes = 5;
      const step = Math.PI / spikes;

      const star = new THREE.Shape();
      let rot = -Math.PI / 2; // point up
      star.moveTo(Math.cos(rot) * outer, Math.sin(rot) * outer);
      for (let i = 0; i < spikes; i++) {
        rot += step;
        star.lineTo(Math.cos(rot) * inner, Math.sin(rot) * inner);
        rot += step;
        star.lineTo(Math.cos(rot) * outer, Math.sin(rot) * outer);
      }
      geom = new THREE.ShapeGeometry(star);
      break;
    }

    case "sticky":
    default:
      geom = new THREE.PlaneGeometry(size, size);
      break;
  }

  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);

  // --- THIS IS THE NEW FIX ---
  // Rotate the entire note object 180 degrees around the X-axis.
  mesh.rotation.x = Math.PI;

  // ----- Text sprite overlay -----
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  function drawLabel(labelText: string, v: number) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    const base = 36;
    const scaled = Math.max(18, base - Math.floor(Math.max(0, labelText.length - 18) * 0.8));
    ctx.font = `bold ${scaled}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxWidth = canvas.width * 0.86;
    const lines = wrapText(labelText, ctx, maxWidth, 2);
    const lineH = scaled + 4;
    const startY = canvas.height / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, i) => {
      ctx.fillText(ln, canvas.width / 2, startY + i * lineH);
    });
    if (typeof v === "number") {
      const badge = `★ ${v}`;
      ctx.fillStyle = "#111";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(badge, 10, 8);
    }
  }

  function wrapText(
    t: string,
    context: CanvasRenderingContext2D,
    maxW: number,
    maxLines = 2
  ): string[] {
    const words = t.split(/\s+/);
    const lines: string[] = [];
    let cur = "";

    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      const { width } = context.measureText(test);
      if (width <= maxW) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
        if (lines.length >= maxLines - 1) break;
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    const leftover = words.slice(lines.join(" ").split(/\s+/).length).join(" ");
    if (leftover) {
      const last = lines.pop() ?? "";
      let ell = last + "…";
      while (context.measureText(ell).width > maxW && ell.length > 1) {
        ell = ell.slice(0, -2) + "…";
      }
      lines.push(ell);
    }
    return lines;
  }

  drawLabel(text, votes);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  // @ts-ignore
  if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
  // @ts-ignore
  if ("encoding" in tex) (tex as any).encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const textMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(textMat);
  sprite.center.set(0.5, 0.5);
  sprite.scale.set(size * 1.6, size * 0.9, 1);
  sprite.position.set(0, 0, 0.01);
  mesh.add(sprite);

  (mesh as any)._noteRedraw = (nextText: string, nextVotes: number) => {
    drawLabel(nextText, nextVotes);
    tex.needsUpdate = true;
  };

  return mesh;
}