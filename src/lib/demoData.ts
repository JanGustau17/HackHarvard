// src/lib/demoData.ts

import type { AIOutput } from "./aiOutputs";

export const demoTranscripts = [
  { id: "t1", text: "Let's brainstorm an AR idea wall." },
  { id: "t2", text: "We want sticky notes that float in space." },
  { id: "t3", text: "Speech should convert to text automatically." },
  { id: "t4", text: "AI should generate a workflow from our discussion." },
  { id: "t5", text: "We can export the summary for the judges." }
];

export const demoAI: AIOutput = {
  summary_md: "## Summary\n\nTeam brainstormed an AR Idea Wall with live speech → notes → AI workflow.",
  workplan: {
    tasks: [
      { id: "1", title: "Build AR note board", priority: "P0", owner: "Alice", eta: "Today" },
      { id: "2", title: "Integrate STT", priority: "P1", owner: "Bob", eta: "Today", dependsOn: ["1"] },
      { id: "3", title: "Run AI summary with Gemini", priority: "P1", owner: "Carol", eta: "Tomorrow", dependsOn: ["2"] }
    ]
  },
  workflow_edges: [
    { from: "Build AR note board", to: "Integrate STT", kind: "depends" },
    { from: "Integrate STT", to: "Run AI summary with Gemini", kind: "depends" }
  ]
};
