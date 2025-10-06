import { useEffect, useMemo, useRef, useState } from "react";

type Action = {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
};

type Props = {
  storageKey?: string;
  actions: Action[];
  footer?: React.ReactNode;
  children?: React.ReactNode;
};

type SavedState = {
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
};

const MIN_W = 320;
const MIN_H = 64;

export default function FloatingToolbar({
  storageKey = "floating_toolbar_v1",
  actions,
  footer,
  children,
}: Props) {
  const initial: SavedState = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 16, y: 16, w: 520, h: 88, open: true };
  }, [storageKey]);

  const [open, setOpen] = useState<boolean>(initial.open);
  const [x, setX] = useState<number>(initial.x);
  const [y, setY] = useState<number>(initial.y);
  const [w, setW] = useState<number>(Math.max(MIN_W, initial.w));
  const [h, setH] = useState<number>(Math.max(MIN_H, initial.h));

  // persist state
  useEffect(() => {
    const s: SavedState = { x, y, w, h, open };
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {}
  }, [x, y, w, h, open, storageKey]);

  // ========================
  // Dragging (toolbar header)
  // ========================
  const dragging = useRef(false);
  const dragOff = useRef({ dx: 0, dy: 0 });

  function onHeaderDown(e: React.MouseEvent) {
    dragging.current = true;
    dragOff.current.dx = e.clientX - x;
    dragOff.current.dy = e.clientY - y;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onMove(e: MouseEvent) {
    if (!dragging.current) return;
    setX(clamp(e.clientX - dragOff.current.dx, 0, window.innerWidth - 100));
    setY(clamp(e.clientY - dragOff.current.dy, 0, window.innerHeight - 40));
  }

  function onUp() {
    dragging.current = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  // ========================
  // Resizing (bottom-right)
  // ========================
  const resizing = useRef(false);
  const sizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  function onGripDown(e: React.MouseEvent) {
    e.stopPropagation();
    resizing.current = true;
    sizeStart.current = { x: e.clientX, y: e.clientY, w, h };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeUp);
  }

  function onResizeMove(e: MouseEvent) {
    if (!resizing.current) return;
    const dw = e.clientX - sizeStart.current.x;
    const dh = e.clientY - sizeStart.current.y;
    setW(Math.max(MIN_W, sizeStart.current.w + dw));
    setH(Math.max(MIN_H, sizeStart.current.h + dh));
  }

  function onResizeUp() {
    resizing.current = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeUp);
  }

  // ========================
  // Floating FAB drag logic
  // ========================
  const fabDragging = useRef(false);
  const fabOff = useRef({ dx: 0, dy: 0 });

  function onFabDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    fabDragging.current = true;
    fabOff.current.dx = e.clientX - x;
    fabOff.current.dy = e.clientY - y;
    window.addEventListener("mousemove", onFabMove);
    window.addEventListener("mouseup", onFabUp);
  }

  function onFabMove(e: MouseEvent) {
    if (!fabDragging.current) return;
    setX(clamp(e.clientX - fabOff.current.dx, 0, window.innerWidth - 100));
    setY(clamp(e.clientY - fabOff.current.dy, 0, window.innerHeight - 40));
  }

  function onFabUp() {
    fabDragging.current = false;
    window.removeEventListener("mousemove", onFabMove);
    window.removeEventListener("mouseup", onFabUp);
  }

  // ========================
  // RENDER
  // ========================
  return (
    <>
      {/* Small launcher when closed */}
      {!open && (
        <button
          onMouseDown={onFabDown}
          onClick={() => setOpen(true)}
          className="fixed z-[9997] px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800 cursor-grab active:cursor-grabbing transition-colors"
          style={{ left: x, top: y }}
          title="Drag anywhere or click to open controls"
        >
          ⚙️ Controls
        </button>
      )}

      {/* Toolbar window */}
      {open && (
        <div
          className="fixed z-[9997] rounded-2xl border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-2xl select-none"
          style={{ left: x, top: y, width: w, height: h }}
        >
          {/* Header (drag handle) */}
          <div
            onMouseDown={onHeaderDown}
            className="cursor-grab active:cursor-grabbing flex items-center gap-2 px-3 py-2 rounded-t-2xl bg-zinc-950/50 border-b border-zinc-800"
          >
            <span className="text-sm text-zinc-200">Controls</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                className="px-2 py-1 text-xs rounded-md border border-zinc-700 hover:bg-zinc-800"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                title="Hide panel"
              >
                Hide
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-3 overflow-auto h-[calc(100%-2.5rem)]">
            {/* Actions */}
            <div className="flex flex-wrap gap-2 mb-3">
              {actions.map((a) => (
                <button
                  key={a.id}
                  onClick={a.onClick}
                  disabled={a.disabled}
                  title={a.title || a.label}
                  className={`px-3 py-1.5 rounded-md border text-sm
                    ${
                      a.disabled
                        ? "border-zinc-800 text-zinc-500"
                        : "border-zinc-700 hover:bg-zinc-800 text-zinc-200"
                    }`}
                >
                  {a.icon ? (
                    <span className="mr-1" aria-hidden>
                      {a.icon}
                    </span>
                  ) : null}
                  {a.label}
                </button>
              ))}
            </div>

            {/* Extra controls */}
            {children}

            {/* Footer */}
            {footer ? (
              <div className="mt-3 pt-2 border-t border-zinc-800 text-xs text-zinc-300 flex flex-wrap gap-2">
                {footer}
              </div>
            ) : null}
          </div>

          {/* Resize grip */}
          <div
            onMouseDown={onGripDown}
            className="absolute right-1 bottom-1 w-3 h-3 cursor-se-resize rounded-sm bg-zinc-700/70"
            title="Drag to resize"
          />
        </div>
      )}
    </>
  );
}

/* clamp util */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
