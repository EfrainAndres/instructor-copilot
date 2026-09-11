import { useState, type JSX } from "react";
import type { EvidenceStage } from "../../../session-engine/model/schema";

interface EvidenceStageEditorProps {
  stages: EvidenceStage[];
  onChange: (stages: EvidenceStage[]) => void;
}

// Keeps EvidenceStage.order synchronized with display position (1, 2, 3, ...) so the
// release sequence hint never drifts from what the instructor sees in the list.
function renumbered(stages: EvidenceStage[]): EvidenceStage[] {
  return stages.map((stage, index) => ({ ...stage, order: index + 1 }));
}

export function EvidenceStageEditor({ stages, onChange }: EvidenceStageEditorProps): JSX.Element {
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<EvidenceStage>): void {
    onChange(stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)));
  }

  function remove(id: string): void {
    onChange(renumbered(stages.filter((stage) => stage.id !== id)));
  }

  function move(id: string, direction: -1 | 1): void {
    const index = stages.findIndex((stage) => stage.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= stages.length) return;
    const next = [...stages];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    onChange(renumbered(next));
  }

  function add(): void {
    const id = newId.trim();
    if (!id || stages.some((stage) => stage.id === id)) {
      setError(`Evidence stage id "${id}" is missing or already used in this step.`);
      return;
    }
    onChange(renumbered([...stages, { id, label: newLabel.trim() || id, order: 0 }]));
    setNewId("");
    setNewLabel("");
    setError(null);
  }

  return (
    <div className="nested-editor">
      <span className="field-label">Evidence stages</span>
      {error && <p className="error-banner">{error}</p>}
      <ul className="nested-list">
        {stages.map((stage, index) => (
          <li key={stage.id} className="nested-list-row nested-list-row-block">
            <div className="nested-item-header">
              <span className="readonly-id">
                {stage.order}. {stage.id}
              </span>
              <div className="nested-list-actions">
                <button type="button" onClick={() => move(stage.id, -1)} disabled={index === 0}>
                  ↑
                </button>
                <button type="button" onClick={() => move(stage.id, 1)} disabled={index === stages.length - 1}>
                  ↓
                </button>
                <button type="button" onClick={() => remove(stage.id)}>
                  Remove
                </button>
              </div>
            </div>
            <div className="nested-item-fields">
              <div className="field">
                <label>Label</label>
                <input type="text" value={stage.label} onChange={(event) => update(stage.id, { label: event.target.value })} />
              </div>
              <div className="field">
                <label>Detail</label>
                <textarea value={stage.detail ?? ""} onChange={(event) => update(stage.id, { detail: event.target.value })} />
              </div>
            </div>
          </li>
        ))}
        {stages.length === 0 && <li className="empty-state">No evidence stages yet.</li>}
      </ul>
      <div className="nested-add-row">
        <input type="text" placeholder="id" value={newId} onChange={(event) => setNewId(event.target.value)} />
        <input
          type="text"
          placeholder="label"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
        />
        <button type="button" onClick={add}>
          + Add evidence stage
        </button>
      </div>
    </div>
  );
}
