import { useState } from "react";
import ProgressTab from "./ProgressTab";

export default function TeamProgressTab() {
  const [activePerson, setActivePerson] = useState<"p1" | "p2" | "p3">("p1");
  const [names, setNames] = useState(() => {
    return {
      p1: localStorage.getItem("team_name_p1") || "person-1",
      p2: localStorage.getItem("team_name_p2") || "person-2",
      p3: localStorage.getItem("team_name_p3") || "person-3",
    };
  });

  const handleNameChange = (id: "p1" | "p2" | "p3", value: string) => {
    setNames((prev) => ({ ...prev, [id]: value }));
    localStorage.setItem(`team_name_${id}`, value);
  };

  return (
    <div className="team-progress-tab">
      {/* Sub-tab buttons */}
      <div className="subtab-bar">
        {(["p1", "p2", "p3"] as const).map((id) => (
          <button
            key={id}
            className={`subtab ${activePerson === id ? "active" : ""}`}
            onClick={() => setActivePerson(id)}
          >
            {names[id]}
          </button>
        ))}
      </div>

      {/* Editable name input */}
      <div className="name-edit">
        <label>
          Edit name:
          <input
            type="text"
            value={names[activePerson]}
            onChange={(e) => handleNameChange(activePerson, e.target.value)}
          />
        </label>
      </div>

      {/* Render ProgressTab with separate storage key per person */}
      <ProgressTab storageKey={`progress_${activePerson}`} />
    </div>
  );
}
