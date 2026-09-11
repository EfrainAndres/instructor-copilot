import type { JSX } from "react";
import { StepTypeSchema, type Step } from "../../../session-engine/model/schema";
import { StringListEditor } from "./StringListEditor";
import { ChecklistEditor } from "./ChecklistEditor";
import { ResourceListEditor } from "./ResourceListEditor";
import { CommandEditor } from "./CommandEditor";
import { EvidenceStageEditor } from "./EvidenceStageEditor";

const STEP_TYPES = StepTypeSchema.options;

interface StepEditorProps {
  step: Step;
  otherSteps: Step[];
  onChange: (step: Step) => void;
}

export function StepEditor({ step, otherSteps, onChange }: StepEditorProps): JSX.Element {
  function set<K extends keyof Step>(key: K, value: Step[K]): void {
    onChange({ ...step, [key]: value });
  }

  return (
    <div className="step-editor">
      <div className="field">
        <label>Id</label>
        <input type="text" value={step.id} readOnly disabled />
      </div>

      <div className="field">
        <label>Type</label>
        <select value={step.type} onChange={(event) => set("type", event.target.value as Step["type"])}>
          {STEP_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Title</label>
        <input type="text" value={step.title} onChange={(event) => set("title", event.target.value)} />
      </div>

      <div className="field">
        <label>Slide reference</label>
        <input
          type="number"
          min={0}
          value={step.slideRef ?? ""}
          onChange={(event) =>
            set("slideRef", event.target.value === "" ? undefined : Number(event.target.value))
          }
        />
      </div>

      <div className="field">
        <label>Planned duration (minutes)</label>
        <input
          type="number"
          min={0.01}
          step="any"
          required
          value={step.plannedDurationMinutes}
          onChange={(event) => set("plannedDurationMinutes", Number(event.target.value))}
        />
      </div>

      <div className="field">
        <label>Objective</label>
        <textarea value={step.objective ?? ""} onChange={(event) => set("objective", event.target.value)} />
      </div>

      <div className="field">
        <label>Facilitator guidance</label>
        <textarea
          value={step.facilitatorGuidance ?? ""}
          onChange={(event) => set("facilitatorGuidance", event.target.value)}
        />
      </div>

      <StringListEditor label="Actions" values={step.actions ?? []} onChange={(values) => set("actions", values)} />
      <StringListEditor
        label="Questions"
        values={step.questions ?? []}
        onChange={(values) => set("questions", values)}
      />
      <StringListEditor
        label="Do not reveal"
        values={step.doNotReveal ?? []}
        onChange={(values) => set("doNotReveal", values)}
      />

      <div className="field">
        <label>Next step</label>
        <select
          value={step.nextStepId ?? ""}
          onChange={(event) => set("nextStepId", event.target.value === "" ? undefined : event.target.value)}
        >
          <option value="">(none)</option>
          {otherSteps.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.id} — {candidate.title}
            </option>
          ))}
        </select>
      </div>

      <ChecklistEditor items={step.checklist ?? []} onChange={(items) => set("checklist", items)} />
      <ResourceListEditor resources={step.resources ?? []} onChange={(resources) => set("resources", resources)} />
      <CommandEditor command={step.command} onChange={(command) => set("command", command)} />
      <EvidenceStageEditor
        stages={step.evidenceStages ?? []}
        onChange={(stages) => set("evidenceStages", stages)}
      />
    </div>
  );
}
