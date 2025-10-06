// src/lib/ProgressTab.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type ProgressTabProps = {
  /** Prefix for all localStorage keys so multiple instances don't collide. */
  storageKey?: string; // default: "progress"
};

export default function ProgressTab({ storageKey = "progress" }: ProgressTabProps) {
  // Helper to namespace keys
  const key = (name: string) => `${storageKey}.${name}`;

  // ---------- Hours Worked (red bar) ----------
  const [targetHours, setTargetHours] = useState<number>(() => {
    const v = localStorage.getItem(key("targetHours"));
    return v ? Number(v) : 24;
  });
  const [doneHours, setDoneHours] = useState<number>(() => {
    const v = localStorage.getItem(key("doneHours"));
    return v ? Number(v) : 0;
  });

  useEffect(() => {
    localStorage.setItem(key("targetHours"), String(targetHours));
  }, [targetHours]);
  useEffect(() => {
    localStorage.setItem(key("doneHours"), String(doneHours));
  }, [doneHours]);

  const hoursPct = useMemo(() => {
    if (!Number.isFinite(targetHours) || targetHours <= 0) return 0;
    const p = (doneHours / targetHours) * 100;
    return Math.max(0, Math.min(100, p));
  }, [targetHours, doneHours]);

  // ---------- Amount of Work Done (green bar) ----------
  const [workPct, setWorkPct] = useState<number>(() => {
    const v = localStorage.getItem(key("workPct"));
    return v ? Number(v) : 0;
  });
  useEffect(() => {
    localStorage.setItem(key("workPct"), String(workPct));
  }, [workPct]);

  const setWorkPctClamped = (v: number) => setWorkPct(Math.max(0, Math.min(100, v)));

  // ---------- Notes (rich text + autosave) ----------
  const [notesHtml, setNotesHtml] = useState<string>(() => {
    return localStorage.getItem(key("notesHtml")) || "";
  });
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notesRef.current && notesHtml !== notesRef.current.innerHTML) {
      notesRef.current.innerHTML = notesHtml;
    }
  }, [notesHtml]);

  const saveNotes = () => {
    if (!notesRef.current) return;
    const html = notesRef.current.innerHTML;
    setNotesHtml(html);
    localStorage.setItem(key("notesHtml"), html);
  };

  // Simple toolbar actions (execCommand is deprecated but works widely; fine for a lightweight editor)
  const cmd = (c: "bold" | "italic" | "underline") => {
    document.execCommand(c, false);
    saveNotes();
  };
  const toggleBulletList = () => {
    document.execCommand("insertUnorderedList", false);
    saveNotes();
  };

  return (
    <div className="progress-tab">
      {/* ---------- Hours worked ---------- */}
      <section className="card">
        <h3>Hours Worked</h3>
        <div className="row">
          <label>
            Target (hrs)
            <input
              type="number"
              min={0}
              step="1"
              value={Number.isFinite(targetHours) ? targetHours : 0}
              onChange={(e) => setTargetHours(Math.max(0, Number(e.target.value)))}
            />
          </label>
          <label>
            Completed (hrs)
            <input
              type="number"
              min={0}
              step="1"
              value={Number.isFinite(doneHours) ? doneHours : 0}
              onChange={(e) => setDoneHours(Math.max(0, Number(e.target.value)))}
            />
          </label>
        </div>

        <div className="bar bar-red" aria-label="hours-progress">
          <div className="fill" style={{ width: `${hoursPct}%` }} />
        </div>
        <div className="bar-caption">
          {hoursPct.toFixed(1)}%
        </div>
      </section>

      {/* ---------- Work done ---------- */}
      <section className="card">
        <h3>Work Done</h3>
        <div className="row">
          <input
            type="range"
            min={0}
            max={100}
            value={workPct}
            onChange={(e) => setWorkPctClamped(Number(e.target.value))}
            aria-label="work-done-slider"
          />
          <label>
            %
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              value={workPct}
              onChange={(e) => setWorkPctClamped(Number(e.target.value))}
              aria-label="work-done-input"
            />
          </label>
        </div>

        <div className="bar bar-green" aria-label="work-progress">
          <div className="fill" style={{ width: `${workPct}%` }} />
        </div>
      </section>

      {/* ---------- Notes ---------- */}
      <section className="card">
        <h3>Notes</h3>
        <div className="toolbar">
          <button onClick={() => cmd("bold")} title="Bold (Ctrl+B)">
            <b>B</b>
          </button>
          <button onClick={() => cmd("italic")} title="Italic (Ctrl+I)">
            <i>I</i>
          </button>
          <button onClick={() => cmd("underline")} title="Underline (Ctrl+U)">
            <u>U</u>
          </button>
          <button onClick={toggleBulletList} title="Bulleted list">• List</button>
        </div>

        <div
          ref={notesRef}
          className="notes-area"
          contentEditable
          suppressContentEditableWarning
          onInput={saveNotes}
          onBlur={saveNotes}
          data-placeholder="Add notes…"
          aria-label="Progress notes editor"
        />
        <div className="hint">Notes auto-save locally.</div>
      </section>
    </div>
  );
}
