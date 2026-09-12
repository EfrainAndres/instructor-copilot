import { useEffect, useRef, useState, type JSX } from "react";
import type { InstructorRunContext, IpcResult } from "../../../shared/ipc";
import { deriveInstructorModeState } from "../lib/instructorModeState";
import { formatMinutesAsClock, formatNoteTimestamp, formatScheduleDelta } from "../lib/timeFormat";
import { reduceCommandExecution, type CommandExecutionState } from "../lib/commandExecutionState";
import { deriveEvidenceStageDisplay } from "../lib/evidenceStageDisplay";

interface InstructorModeScreenProps {
  context: InstructorRunContext;
  onContextUpdated: (context: InstructorRunContext) => void;
  onBackToTraining: () => void;
  /** True only when this screen was entered via startup recovery, not a fresh Start Session. */
  recovered?: boolean;
}

function formatStepType(type: string): string {
  return type.replace(/_/g, " ");
}

export function InstructorModeScreen({
  context,
  onContextUpdated,
  onBackToTraining,
  recovered = false
}: InstructorModeScreenProps): JSX.Element {
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Seeded once from the `recovered` prop; not re-synced on prop changes since this
  // banner is purely local UX state, not persisted.
  const [showRecoveredBanner, setShowRecoveredBanner] = useState(recovered);
  const [noteText, setNoteText] = useState("");
  const [commandExecution, setCommandExecution] = useState<CommandExecutionState | null>(null);
  const [commandStarting, setCommandStarting] = useState(false);
  // Tracks the latest known executionId synchronously (independent of React's render
  // cycle) so listeners registered once on mount can filter events for whichever
  // execution is current, regardless of which source (started event vs. invoke
  // response) learns of a new executionId first.
  const currentExecutionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribeStarted = window.instructorCopilot.command.onStarted((event) => {
      currentExecutionIdRef.current = event.executionId;
      setCommandExecution((prev) => reduceCommandExecution(prev, { type: "started", ...event }));
    });
    const unsubscribeOutput = window.instructorCopilot.command.onOutput((event) => {
      if (event.executionId !== currentExecutionIdRef.current) return;
      setCommandExecution((prev) => reduceCommandExecution(prev, { type: "output", ...event }));
    });
    const unsubscribeCompleted = window.instructorCopilot.command.onCompleted((event) => {
      if (event.executionId !== currentExecutionIdRef.current) return;
      setCommandExecution((prev) => reduceCommandExecution(prev, { type: "completed", ...event }));
    });
    return () => {
      unsubscribeStarted();
      unsubscribeOutput();
      unsubscribeCompleted();
    };
  }, []);

  const completedAt = context.run.completedAt;
  useEffect(() => {
    if (completedAt) {
      return;
    }
    const id = setInterval(() => setNowIso(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, [completedAt]);

  const derived = deriveInstructorModeState(context.session, context.run, nowIso);

  // Auto-dismiss once the instructor explicitly resumes; a simple dismiss button
  // also clears it immediately without waiting for Resume.
  useEffect(() => {
    if (!derived.paused) setShowRecoveredBanner(false);
  }, [derived.paused]);

  async function handleAction(action: () => Promise<IpcResult<InstructorRunContext>>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onContextUpdated(result.value);
    } finally {
      setBusy(false);
    }
  }

  function handleComplete(): void {
    if (window.confirm("Complete this session?")) {
      void handleAction(() => window.instructorCopilot.run.complete());
    }
  }

  function handleToggleChecklist(itemId: string, value: boolean): void {
    if (!derived.currentStepId) return;
    void handleAction(() =>
      window.instructorCopilot.run.setChecklistItem({ stepId: derived.currentStepId!, itemId, value })
    );
  }

  function handleReleaseEvidence(evidenceStageId: string): void {
    void handleAction(() => window.instructorCopilot.run.releaseEvidenceStage({ evidenceStageId }));
  }

  async function handleAddNote(): Promise<void> {
    const trimmed = noteText.trim();
    if (trimmed.length === 0) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.run.addNote({ text: noteText });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onContextUpdated(result.value);
      setNoteText("");
    } finally {
      setBusy(false);
    }
  }

  /** Launch actions never mutate SessionRun state - only the error banner reacts. */
  async function handleResourceAction(action: () => Promise<IpcResult<null>>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleOpenPresentation(): void {
    void handleResourceAction(() => window.instructorCopilot.resource.openPresentation());
  }

  function handleOpenResource(resourceId: string): void {
    void handleResourceAction(() => window.instructorCopilot.resource.openCurrentStepResource({ resourceId }));
  }

  async function handleRunCommand(commandId: string): Promise<void> {
    setError(null);
    setCommandStarting(true);
    try {
      const result = await window.instructorCopilot.command.runCurrentStep({ commandId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.canceled) {
        return;
      }
      const executionId = result.value.executionId!;
      // Idempotent: if the one-way "started" event already initialized state for
      // this executionId (the normal, fast path), this is a no-op that preserves
      // any output accumulated in the meantime. If this invoke response instead
      // resolves first for any reason, it initializes state here instead.
      currentExecutionIdRef.current = executionId;
      setCommandExecution((prev) =>
        reduceCommandExecution(prev, {
          type: "started",
          executionId,
          label: result.value.label ?? commandId
        })
      );
    } finally {
      setCommandStarting(false);
    }
  }

  if (derived.completed) {
    return (
      <main className="screen instructor-mode-completed">
        <h1>Session complete</h1>
        <p className="im-session-title">{context.session.title}</p>
        <p>
          Total active elapsed: <strong>{formatMinutesAsClock(derived.sessionElapsedMinutes)}</strong>
        </p>
        <p className="readonly-id">Run id: {context.run.id}</p>
        <button type="button" onClick={onBackToTraining}>
          Back to Training
        </button>
      </main>
    );
  }

  const delta = derived.scheduleDeltaMinutesValue !== undefined ? formatScheduleDelta(derived.scheduleDeltaMinutesValue) : null;

  return (
    <main className="screen instructor-mode-screen">
      {derived.paused && <div className="im-paused-badge">PAUSED</div>}

      {showRecoveredBanner && (
        <div className="im-recovered-banner">
          <span>Session recovered after restart. Review the current Step and press Resume when ready.</span>
          <button type="button" onClick={() => setShowRecoveredBanner(false)}>
            Dismiss
          </button>
        </div>
      )}

      <header className="im-status-bar">
        <div className="im-status-title">{context.session.title}</div>
        <div className="im-status-row">
          <div className="im-status-block">
            <span className="im-status-label">SESSION</span>
            <span className="im-status-value">{formatMinutesAsClock(derived.sessionElapsedMinutes)}</span>
          </div>
          <div className="im-status-block">
            <span className="im-status-label">STEP</span>
            <span className="im-status-value">
              {derived.stepNumber ? `${String(derived.stepNumber).padStart(2, "0")} / ${derived.stepCount}` : "—"}
            </span>
            {derived.stepElapsedMinutes !== undefined && (
              <span className="im-status-subvalue">{formatMinutesAsClock(derived.stepElapsedMinutes)}</span>
            )}
          </div>
          <div className="im-status-block">
            <span className="im-status-label">STATUS</span>
            {delta ? (
              <>
                <span className={delta.status === "BEHIND" ? "im-status-value im-behind" : "im-status-value im-on-plan"}>
                  {delta.status}
                </span>
                <span className="im-status-subvalue">{delta.detail}</span>
              </>
            ) : (
              <span className="im-status-value">—</span>
            )}
          </div>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {context.session.presentation && (
        <button type="button" className="im-open-presentation" onClick={handleOpenPresentation} disabled={busy}>
          Open Presentation
        </button>
      )}

      {derived.currentStep ? (
        <section className="im-step-content">
          <h1>{derived.currentStep.title}</h1>
          <p className="im-step-meta">
            {formatStepType(derived.currentStep.type)}
            {derived.currentStep.slideRef !== undefined ? ` · Slide ${derived.currentStep.slideRef}` : ""}
          </p>

          {derived.currentStep.objective && (
            <div className="im-field-block">
              <h2>Objective</h2>
              <p>{derived.currentStep.objective}</p>
            </div>
          )}

          {derived.currentStep.facilitatorGuidance && (
            <div className="im-field-block">
              <h2>Facilitator guidance</h2>
              <p>{derived.currentStep.facilitatorGuidance}</p>
            </div>
          )}

          {derived.currentStep.actions && derived.currentStep.actions.length > 0 && (
            <div className="im-field-block">
              <h2>Do now</h2>
              <ul>
                {derived.currentStep.actions.map((action, index) => (
                  <li key={index}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          {derived.currentStep.questions && derived.currentStep.questions.length > 0 && (
            <div className="im-field-block">
              <h2>Ask</h2>
              <ul>
                {derived.currentStep.questions.map((question, index) => (
                  <li key={index}>{question}</li>
                ))}
              </ul>
            </div>
          )}

          {derived.currentStep.doNotReveal && derived.currentStep.doNotReveal.length > 0 && (
            <div className="im-field-block im-do-not-reveal">
              <h2>Do not reveal</h2>
              <ul>
                {derived.currentStep.doNotReveal.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {derived.currentStep.checklist && derived.currentStep.checklist.length > 0 && (
            <div className="im-field-block">
              <h2>Checklist</h2>
              <ul className="im-checklist">
                {derived.currentStep.checklist.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={derived.currentStepRun?.checklistState[item.id] ?? false}
                        onChange={(event) => handleToggleChecklist(item.id, event.target.checked)}
                      />
                      {item.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {derived.currentStep.resources && derived.currentStep.resources.length > 0 && (
            <div className="im-field-block">
              <h2>Resources</h2>
              <ul className="im-resource-list">
                {derived.currentStep.resources.map((resource) => (
                  <li key={resource.id}>
                    <span>
                      {resource.label} · {resource.kind}
                    </span>
                    <button type="button" onClick={() => handleOpenResource(resource.id)} disabled={busy}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {derived.currentStep.command && (
            <div className="im-field-block">
              <h2>Command</h2>
              <p className="im-command-label">
                {derived.currentStep.command.label}
                {derived.currentStep.command.sensitive && <span className="im-sensitive-badge">Sensitive</span>}
              </p>
              <p className="im-command-preview">
                <code>{derived.currentStep.command.executable}</code>
                {(derived.currentStep.command.args ?? []).map((arg, index) => (
                  <code key={index}> {arg}</code>
                ))}
              </p>
              <button
                type="button"
                onClick={() => void handleRunCommand(derived.currentStep!.command!.id)}
                disabled={commandStarting || commandExecution?.status === "running"}
              >
                Run Command
              </button>
            </div>
          )}

          {derived.currentStep.evidenceStages && derived.currentStep.evidenceStages.length > 0 && (
            <div className="im-field-block im-evidence">
              <h2>Evidence</h2>
              <ul className="im-evidence-list">
                {deriveEvidenceStageDisplay(derived.currentStep, derived.currentStepRun).map((stage) => (
                  <li key={stage.id} className={stage.released ? "im-evidence-item released" : "im-evidence-item locked"}>
                    <div className="im-evidence-header">
                      <span className="im-evidence-order">{stage.order}.</span>
                      <span className="im-evidence-label">{stage.label}</span>
                      <span className="im-evidence-status">{stage.released ? "RELEASED" : "LOCKED"}</span>
                    </div>
                    {stage.released ? (
                      stage.detail && <p className="im-evidence-detail">{stage.detail}</p>
                    ) : (
                      <button type="button" onClick={() => handleReleaseEvidence(stage.id)} disabled={busy}>
                        Release
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="im-field-block im-notes">
            <h2>Notes</h2>
            <textarea
              className="im-notes-input"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Quick note for this Step…"
              rows={3}
            />
            <button type="button" onClick={() => void handleAddNote()} disabled={busy || noteText.trim().length === 0}>
              Add Note
            </button>
            {(() => {
              const stepNotes = context.run.notes
                .filter((note) => note.stepId === derived.currentStepId)
                .slice()
                .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
              return stepNotes.length > 0 ? (
                <ul className="im-notes-list">
                  {stepNotes.map((note) => (
                    <li key={note.id}>
                      <span className="im-note-time">{formatNoteTimestamp(note.timestamp)}</span> — {note.text}
                    </li>
                  ))}
                </ul>
              ) : null;
            })()}
          </div>
        </section>
      ) : (
        <section className="im-step-content">
          <p className="empty-state">{derived.stepCount === 0 ? "No steps in this session." : "No active Step."}</p>
        </section>
      )}

      {commandExecution && (
        <section className="im-command-output">
          <h2>Command Output</h2>
          <p className="im-command-output-label">{commandExecution.label}</p>
          <p className="im-command-output-status">
            {commandExecution.status === "running"
              ? "Running…"
              : commandExecution.error
                ? `Failed to start command: ${commandExecution.error}`
                : `Exit code: ${commandExecution.exitCode ?? "—"}`}
          </p>
          {commandExecution.stdout && (
            <>
              <h3>stdout</h3>
              <pre className="im-command-stream">{commandExecution.stdout}</pre>
            </>
          )}
          {commandExecution.stderr && (
            <>
              <h3>stderr</h3>
              <pre className="im-command-stream im-command-stderr">{commandExecution.stderr}</pre>
            </>
          )}
        </section>
      )}

      <footer className="im-controls">
        <button type="button" onClick={() => handleAction(() => window.instructorCopilot.run.previous())} disabled={busy || !derived.canGoPrevious}>
          Previous
        </button>
        {derived.paused ? (
          <button type="button" onClick={() => handleAction(() => window.instructorCopilot.run.resume())} disabled={busy || !derived.canResume}>
            Resume
          </button>
        ) : (
          <button type="button" onClick={() => handleAction(() => window.instructorCopilot.run.pause())} disabled={busy || !derived.canPause}>
            Pause
          </button>
        )}
        <button type="button" onClick={() => handleAction(() => window.instructorCopilot.run.skip())} disabled={busy || !derived.canSkip}>
          Skip
        </button>
        {derived.hasNextTarget ? (
          <button
            type="button"
            onClick={() => handleAction(() => window.instructorCopilot.run.next())}
            disabled={busy || !derived.canGoNext}
          >
            Next
          </button>
        ) : (
          <button type="button" onClick={handleComplete} disabled={busy || !derived.canComplete}>
            Complete Session
          </button>
        )}
      </footer>
    </main>
  );
}
