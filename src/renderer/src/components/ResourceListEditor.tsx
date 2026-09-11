import { useState, type JSX } from "react";
import { ResourceKindSchema, type Resource, type ResourceKind } from "../../../session-engine/model/schema";

const RESOURCE_KINDS = ResourceKindSchema.options;

interface ResourceListEditorProps {
  resources: Resource[];
  onChange: (resources: Resource[]) => void;
}

function withKindInvariant(resource: Resource, kind: ResourceKind): Resource {
  // Following the canonical Resource invariant: root must be omitted for "application"
  // and is otherwise required. Switching kind adjusts root accordingly rather than
  // leaving it in a state Save would reject.
  if (kind === "application") {
    const { root: _root, ...withoutRoot } = resource;
    return { ...withoutRoot, kind };
  }
  return { ...resource, kind, root: resource.root ?? "" };
}

function ResourceFields({
  resource,
  onChange
}: {
  resource: Resource;
  onChange: (resource: Resource) => void;
}): JSX.Element {
  return (
    <div className="nested-item-fields">
      <div className="field">
        <label>Kind</label>
        <select
          value={resource.kind}
          onChange={(event) => onChange(withKindInvariant(resource, event.target.value as ResourceKind))}
        >
          {RESOURCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Label</label>
        <input type="text" value={resource.label} onChange={(event) => onChange({ ...resource, label: event.target.value })} />
      </div>
      {resource.kind !== "application" && (
        <div className="field">
          <label>Content root</label>
          <input
            type="text"
            value={resource.root ?? ""}
            onChange={(event) => onChange({ ...resource, root: event.target.value })}
            required
          />
        </div>
      )}
      <div className="field">
        <label>Path</label>
        <input type="text" value={resource.path} onChange={(event) => onChange({ ...resource, path: event.target.value })} />
      </div>
    </div>
  );
}

export function ResourceListEditor({ resources, onChange }: ResourceListEditorProps): JSX.Element {
  const [newId, setNewId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function updateAt(id: string, updated: Resource): void {
    onChange(resources.map((resource) => (resource.id === id ? updated : resource)));
  }

  function remove(id: string): void {
    onChange(resources.filter((resource) => resource.id !== id));
  }

  function move(id: string, direction: -1 | 1): void {
    const index = resources.findIndex((resource) => resource.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= resources.length) return;
    const next = [...resources];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    onChange(next);
  }

  function add(): void {
    const id = newId.trim();
    if (!id || resources.some((resource) => resource.id === id)) {
      setError(`Resource id "${id}" is missing or already used in this step.`);
      return;
    }
    onChange([...resources, { id, kind: "file", label: id, root: "", path: "" }]);
    setNewId("");
    setError(null);
  }

  return (
    <div className="nested-editor">
      <span className="field-label">Resources</span>
      {error && <p className="error-banner">{error}</p>}
      <ul className="nested-list">
        {resources.map((resource, index) => (
          <li key={resource.id} className="nested-list-row nested-list-row-block">
            <div className="nested-item-header">
              <span className="readonly-id">{resource.id}</span>
              <div className="nested-list-actions">
                <button type="button" onClick={() => move(resource.id, -1)} disabled={index === 0}>
                  ↑
                </button>
                <button type="button" onClick={() => move(resource.id, 1)} disabled={index === resources.length - 1}>
                  ↓
                </button>
                <button type="button" onClick={() => remove(resource.id)}>
                  Remove
                </button>
              </div>
            </div>
            <ResourceFields resource={resource} onChange={(updated) => updateAt(resource.id, updated)} />
          </li>
        ))}
        {resources.length === 0 && <li className="empty-state">No resources yet.</li>}
      </ul>
      <div className="nested-add-row">
        <input type="text" placeholder="id" value={newId} onChange={(event) => setNewId(event.target.value)} />
        <button type="button" onClick={add}>
          + Add resource
        </button>
      </div>
    </div>
  );
}
