import { useState, type JSX } from "react";
import type { ChecklistItem } from "../../../session-engine/model/schema";

interface ChecklistEditorProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export function ChecklistEditor({ items, onChange }: ChecklistEditorProps): JSX.Element {
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function updateLabel(id: string, label: string): void {
    onChange(items.map((item) => (item.id === id ? { ...item, label } : item)));
  }

  function remove(id: string): void {
    onChange(items.filter((item) => item.id !== id));
  }

  function move(id: string, direction: -1 | 1): void {
    const index = items.findIndex((item) => item.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    onChange(next);
  }

  function add(): void {
    const id = newId.trim();
    if (!id || items.some((item) => item.id === id)) {
      setError(`Checklist id "${id}" is missing or already used in this step.`);
      return;
    }
    onChange([...items, { id, label: newLabel.trim() || id }]);
    setNewId("");
    setNewLabel("");
    setError(null);
  }

  return (
    <div className="nested-editor">
      <span className="field-label">Checklist</span>
      {error && <p className="error-banner">{error}</p>}
      <ul className="nested-list">
        {items.map((item, index) => (
          <li key={item.id} className="nested-list-row">
            <span className="readonly-id">{item.id}</span>
            <input
              type="text"
              value={item.label}
              onChange={(event) => updateLabel(item.id, event.target.value)}
            />
            <div className="nested-list-actions">
              <button type="button" onClick={() => move(item.id, -1)} disabled={index === 0}>
                ↑
              </button>
              <button type="button" onClick={() => move(item.id, 1)} disabled={index === items.length - 1}>
                ↓
              </button>
              <button type="button" onClick={() => remove(item.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="empty-state">No checklist items yet.</li>}
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
          + Add checklist item
        </button>
      </div>
    </div>
  );
}
