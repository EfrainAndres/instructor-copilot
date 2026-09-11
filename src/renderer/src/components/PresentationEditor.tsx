import { useState, type JSX } from "react";
import type { Resource } from "../../../session-engine/model/schema";

interface PresentationEditorProps {
  presentation: Resource | undefined;
  onChange: (presentation: Resource | undefined) => void;
}

export function PresentationEditor({ presentation, onChange }: PresentationEditorProps): JSX.Element {
  const [newId, setNewId] = useState("");

  function addPresentation(): void {
    const id = newId.trim();
    if (!id) return;
    onChange({ id, kind: "presentation", label: id, root: "", path: "" });
    setNewId("");
  }

  if (!presentation) {
    return (
      <div className="nested-editor">
        <span className="field-label">Presentation</span>
        <p className="empty-state">No presentation associated.</p>
        <div className="nested-add-row">
          <input type="text" placeholder="id" value={newId} onChange={(event) => setNewId(event.target.value)} />
          <button type="button" onClick={addPresentation}>
            + Configure presentation
          </button>
        </div>
      </div>
    );
  }

  function update(patch: Partial<Resource>): void {
    if (!presentation) return;
    onChange({ ...presentation, ...patch });
  }

  return (
    <div className="nested-editor">
      <span className="field-label">Presentation</span>
      <div className="nested-item-fields">
        <p className="readonly-id">Id: {presentation.id}</p>
        <div className="field">
          <label>Label</label>
          <input type="text" value={presentation.label} onChange={(event) => update({ label: event.target.value })} />
        </div>
        <div className="field">
          <label>Content root</label>
          <input type="text" value={presentation.root ?? ""} onChange={(event) => update({ root: event.target.value })} required />
        </div>
        <div className="field">
          <label>Path</label>
          <input type="text" value={presentation.path} onChange={(event) => update({ path: event.target.value })} required />
        </div>
        <button type="button" onClick={() => onChange(undefined)}>
          Remove presentation
        </button>
      </div>
    </div>
  );
}
