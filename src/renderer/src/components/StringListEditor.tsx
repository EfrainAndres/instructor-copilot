import type { JSX } from "react";

interface StringListEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}

export function StringListEditor({ label, values, onChange }: StringListEditorProps): JSX.Element {
  function updateAt(index: number, value: string): void {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number): void {
    onChange(values.filter((_, i) => i !== index));
  }

  function add(): void {
    onChange([...values, ""]);
  }

  return (
    <div className="string-list-editor">
      <span className="field-label">{label}</span>
      {values.map((value, index) => (
        <div className="string-list-row" key={index}>
          <input
            type="text"
            value={value}
            onChange={(event) => updateAt(index, event.target.value)}
          />
          <button type="button" onClick={() => removeAt(index)} aria-label={`Remove ${label} item ${index + 1}`}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={add}>
        + Add
      </button>
    </div>
  );
}
