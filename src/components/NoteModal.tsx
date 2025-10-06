// src/components/NoteModal.tsx
import React, { useEffect, useRef } from "react";
import type { NoteDoc } from "../types";

type NoteModalProps = {
  onSubmit: (note: Pick<NoteDoc, "text" | "color" | "shape">) => void;
  onCancel: () => void;
};

export default function NoteModal({ onSubmit, onCancel }: NoteModalProps) {
  const textRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const shapeRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleSubmit = () => {
    const text = textRef.current?.value.trim() || "";
    const color = colorRef.current?.value || "#FFD966";
    const shape = (shapeRef.current?.value || "sticky") as NoteDoc["shape"];
    if (!text) {
      alert("Please enter note text");
      return;
    }
    onSubmit({ text, color, shape });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ zIndex: 9998 }}
        onClick={onCancel}
      />
      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-900 text-white p-5 w-[280px] shadow-2xl"
        style={{ zIndex: 9999 }}
        role="dialog"
        aria-label="Create Note"
      >
        <h3 className="text-lg font-semibold mb-2">Create Note</h3>

        <label className="text-sm font-medium">Text:</label>
        <input
          ref={textRef}
          type="text"
          className="w-full mb-3 p-1.5 rounded-md border border-zinc-700 bg-zinc-800 text-white"
          placeholder="Enter note text"
        />

        <label className="text-sm font-medium">Color:</label>
        <input
          ref={colorRef}
          type="color"
          defaultValue="#FFD966"
          className="w-full mb-3 h-8 cursor-pointer bg-zinc-800 border border-zinc-700 rounded-md"
        />

        <label className="text-sm font-medium">Shape:</label>
        <select
          ref={shapeRef}
          className="w-full mb-4 p-1.5 rounded-md border border-zinc-700 bg-zinc-800 text-white"
          defaultValue="sticky"
        >
          <option value="sticky">Sticky</option>
          <option value="circle">Circle</option>
          <option value="diamond">Diamond</option>
          <option value="hex">Hexagon</option>
          <option value="star">Star</option>
        </select>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1 rounded-md border border-zinc-600 hover:bg-zinc-800 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm text-white"
          >
            Add
          </button>
        </div>
      </div>
    </>
  );
}
