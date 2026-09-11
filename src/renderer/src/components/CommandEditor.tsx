import { useState, type JSX } from "react";
import type { CommandAction } from "../../../session-engine/model/schema";
import { StringListEditor } from "./StringListEditor";

interface CommandEditorProps {
  command: CommandAction | undefined;
  onChange: (command: CommandAction | undefined) => void;
}

export function CommandEditor({ command, onChange }: CommandEditorProps): JSX.Element {
  const [newId, setNewId] = useState("");

  function addCommand(): void {
    const id = newId.trim();
    if (!id) return;
    onChange({ id, label: id, executable: "", root: "", cwd: "" });
    setNewId("");
  }

  if (!command) {
    return (
      <div className="nested-editor">
        <span className="field-label">Command</span>
        <p className="empty-state">No command configured for this step.</p>
        <div className="nested-add-row">
          <input type="text" placeholder="id" value={newId} onChange={(event) => setNewId(event.target.value)} />
          <button type="button" onClick={addCommand}>
            + Add command
          </button>
        </div>
      </div>
    );
  }

  function update(patch: Partial<CommandAction>): void {
    if (!command) return;
    onChange({ ...command, ...patch });
  }

  return (
    <div className="nested-editor">
      <span className="field-label">Command</span>
      <div className="nested-item-fields">
        <p className="readonly-id">Id: {command.id}</p>
        <div className="field">
          <label>Label</label>
          <input type="text" value={command.label} onChange={(event) => update({ label: event.target.value })} />
        </div>
        <div className="field">
          <label>Executable</label>
          <input
            type="text"
            value={command.executable}
            onChange={(event) => update({ executable: event.target.value })}
            required
          />
        </div>
        <StringListEditor
          label="Arguments"
          values={command.args ?? []}
          onChange={(values) => update({ args: values })}
        />
        <div className="field">
          <label>Content root</label>
          <input type="text" value={command.root} onChange={(event) => update({ root: event.target.value })} required />
        </div>
        <div className="field">
          <label>Working directory (relative to root)</label>
          <input type="text" value={command.cwd} onChange={(event) => update({ cwd: event.target.value })} required />
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={command.sensitive ?? false}
            onChange={(event) => update({ sensitive: event.target.checked })}
          />
          Sensitive (requires confirmation before running)
        </label>
        <button type="button" onClick={() => onChange(undefined)}>
          Remove command
        </button>
      </div>
    </div>
  );
}
