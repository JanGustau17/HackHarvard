// src/lib/exportPng.ts
export function exportCanvasPNG(canvas: HTMLCanvasElement, name = "idea-wall.png") {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
