import { useState, type JSX } from "react";
import { StepTypeSchema, type Session, type Step } from "../../../session-engine/model/schema";
import type { TrainingBundle } from "../../../session-engine/persistence/trainingRepository";
import { StepEditor } from "../components/StepEditor";
import { PresentationEditor } from "../components/PresentationEditor";

interface SessionEditorScreenProps {
  session: Session;
  onBundleUpdated: (bundle: TrainingBundle) => void;
  onBack: () => void;
}

function cloneSession(session: Session): Session {
  return structuredClone(session);
}

export function SessionEditorScreen({ session, onBundleUpdated, onBack }: SessionEditorScreenProps): JSX.Element {
  const [working, setWorking] = useState<Session>(() => cloneSession(session));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(working.steps[0]?.id ?? null);

  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepId, setNewStepId] = useState("");
  const [newStepType, setNewStepType] = useState(StepTypeSchema.options[0]);
  const [newStepTitle, setNewStepTitle] = useState("");
  const [newStepDuration, setNewStepDuration] = useState(5);

  function mutate(updater: (draft: Session) => Session): void {
    setWorking((current) => updater(current));
    setDirty(true);
  }

  function handleBack(): void {
    if (dirty && !window.confirm("You have unsaved changes in this Session. Leave without saving?")) {
      return;
    }
    onBack();
  }

  function handleTitleChange(value: string): void {
    mutate((draft) => ({ ...draft, title: value }));
  }

  function handleDurationChange(value: number): void {
    mutate((draft) => ({ ...draft, plannedDurationMinutes: value }));
  }

  function handleLocaleChange(value: string): void {
    mutate((draft) => ({ ...draft, locale: value === "" ? undefined : (value as Session["locale"]) }));
  }

  function handleFacilitationBufferChange(value: string): void {
    mutate((draft) => ({ ...draft, facilitationBufferMinutes: value === "" ? undefined : Number(value) }));
  }

  function handleStepChange(updatedStep: Step): void {
    mutate((draft) => ({
      ...draft,
      steps: draft.steps.map((step) => (step.id === updatedStep.id ? updatedStep : step))
    }));
  }

  function handleAddStep(): void {
    const id = newStepId.trim();
    if (!id || working.steps.some((step) => step.id === id)) {
      setError(`Step id "${id}" is missing or already used in this session.`);
      return;
    }
    const newStep: Step = {
      id,
      type: newStepType,
      title: newStepTitle.trim() || id,
      plannedDurationMinutes: newStepDuration
    };
    mutate((draft) => ({ ...draft, steps: [...draft.steps, newStep] }));
    setSelectedStepId(id);
    setShowAddStep(false);
    setNewStepId("");
    setNewStepTitle("");
    setNewStepDuration(5);
    setError(null);
  }

  function handleDeleteStep(stepId: string): void {
    mutate((draft) => ({
      ...draft,
      // Deleting a step clears any nextStepId reference to it elsewhere, rather than
      // blocking the delete - the simpler, fully deterministic option.
      steps: draft.steps
        .filter((step) => step.id !== stepId)
        .map((step) => (step.nextStepId === stepId ? { ...step, nextStepId: undefined } : step))
    }));
    if (selectedStepId === stepId) {
      setSelectedStepId(null);
    }
  }

  function handleMove(stepId: string, direction: -1 | 1): void {
    mutate((draft) => {
      const index = draft.steps.findIndex((step) => step.id === stepId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= draft.steps.length) {
        return draft;
      }
      const steps = [...draft.steps];
      const [moved] = steps.splice(index, 1);
      if (!moved) return draft;
      steps.splice(targetIndex, 0, moved);
      return { ...draft, steps };
    });
  }

  async function handleSave(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.session.save(working);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onBundleUpdated(result.value);
      const savedSession = result.value.sessions.find((candidate) => candidate.id === working.id);
      if (savedSession) {
        setWorking(cloneSession(savedSession));
      }
      setDirty(false);
    } finally {
      setBusy(false);
    }
  }

  const selectedStep = working.steps.find((step) => step.id === selectedStepId) ?? null;

  return (
    <main className="screen session-editor-screen">
      <div className="screen-header">
        <button type="button" onClick={handleBack}>
          ← Back to Training
        </button>
        <button type="button" onClick={handleSave} disabled={busy || !dirty}>
          {dirty ? "Save" : "Saved"}
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <section className="session-metadata">
        <p className="readonly-id">Session id: {working.id}</p>
        <div className="field">
          <label>Title</label>
          <input type="text" value={working.title} onChange={(event) => handleTitleChange(event.target.value)} />
        </div>
        <div className="field">
          <label>Planned duration (minutes)</label>
          <input
            type="number"
            min={0.01}
            step="any"
            required
            value={working.plannedDurationMinutes}
            onChange={(event) => handleDurationChange(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <label>Locale (defaults to English when unset)</label>
          <select value={working.locale ?? ""} onChange={(event) => handleLocaleChange(event.target.value)}>
            <option value="">(default) en</option>
            <option value="en">en</option>
            <option value="es">es</option>
          </select>
        </div>
        <div className="field">
          <label>Facilitation buffer (minutes, optional - e.g. 5 for a final closing margin)</label>
          <input
            type="number"
            min={0}
            step="any"
            value={working.facilitationBufferMinutes ?? ""}
            onChange={(event) => handleFacilitationBufferChange(event.target.value)}
          />
        </div>
        <PresentationEditor
          presentation={working.presentation}
          onChange={(presentation) => mutate((draft) => ({ ...draft, presentation }))}
        />
      </section>

      <section className="steps-section">
        <div className="steps-panel">
          <div className="screen-header">
            <h2>Steps</h2>
            <button type="button" onClick={() => setShowAddStep((value) => !value)}>
              + Add Step
            </button>
          </div>

          {showAddStep && (
            <form
              className="create-step-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleAddStep();
              }}
            >
              <div className="field">
                <label>Id</label>
                <input type="text" value={newStepId} onChange={(event) => setNewStepId(event.target.value)} required />
              </div>
              <div className="field">
                <label>Type</label>
                <select value={newStepType} onChange={(event) => setNewStepType(event.target.value as Step["type"])}>
                  {StepTypeSchema.options.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Title</label>
                <input type="text" value={newStepTitle} onChange={(event) => setNewStepTitle(event.target.value)} />
              </div>
              <div className="field">
                <label>Planned duration (minutes)</label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  required
                  value={newStepDuration}
                  onChange={(event) => setNewStepDuration(Number(event.target.value))}
                />
              </div>
              <button type="submit">Add</button>
            </form>
          )}

          <ul className="step-list">
            {working.steps.map((step, index) => (
              <li
                key={step.id}
                className={step.id === selectedStepId ? "step-list-item selected" : "step-list-item"}
              >
                <button type="button" className="step-select" onClick={() => setSelectedStepId(step.id)}>
                  <span className="step-order">{index + 1}.</span>
                  <span className="step-title">{step.title}</span>
                  <span className="step-type">{step.type}</span>
                </button>
                <div className="step-actions">
                  <button type="button" onClick={() => handleMove(step.id, -1)} disabled={index === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(step.id, 1)}
                    disabled={index === working.steps.length - 1}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => handleDeleteStep(step.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {working.steps.length === 0 && <li className="empty-state">No steps yet.</li>}
          </ul>
        </div>

        <div className="step-detail-panel">
          {selectedStep ? (
            <StepEditor
              step={selectedStep}
              otherSteps={working.steps.filter((step) => step.id !== selectedStep.id)}
              onChange={handleStepChange}
            />
          ) : (
            <p className="empty-state">Select a step to edit its details.</p>
          )}
        </div>
      </section>
    </main>
  );
}
