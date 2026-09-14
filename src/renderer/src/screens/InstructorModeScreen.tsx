import { useEffect, useRef, useState, type JSX } from "react";
import type { InstructorRunContext, IpcResult } from "../../../shared/ipc";
import { deriveInstructorModeState } from "../lib/instructorModeState";
import { deriveFacilitationSections, deriveNextPreview } from "../lib/facilitationDisplay";
import { formatMinutesAsClock, formatNoteTimestamp } from "../lib/timeFormat";
import { reduceCommandExecution, type CommandExecutionState } from "../lib/commandExecutionState";
import { deriveEvidenceStageDisplay } from "../lib/evidenceStageDisplay";
import { formatStepTypeLabel, getDictionary } from "../lib/i18n";

interface InstructorModeScreenProps {
  context: InstructorRunContext;
  onContextUpdated: (context: InstructorRunContext) => void;
  onBackToTraining: () => void;
  /** True only when this screen was entered via startup recovery, not a fresh Start Session. */
  recovered?: boolean;
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
  // Notes and Context are collapsed by default on every Step (Phase 9B-A three-second-
  // glance rule) - reset whenever the active Step changes, never persisted.
  const [notesOpen, setNotesOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  // Tracks the latest known executionId synchronously (independent of React's render
  // cycle) so listeners registered once on mount can filter events for whichever
  // execution is current, regardless of which source (started event vs. invoke
  // response) learns of a new executionId first.
  const currentExecutionIdRef = useRef<string | null>(null);

  const dictionary = getDictionary(context.session.locale);

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

  useEffect(() => {
    setNotesOpen(false);
    setContextOpen(false);
  }, [derived.currentStepId]);

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
    if (window.confirm(dictionary.completeSessionConfirm)) {
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
        <h1>{dictionary.sessionComplete}</h1>
        <p className="im-session-title">{context.session.title}</p>
        <p>
          {dictionary.totalActiveElapsed}: <strong>{formatMinutesAsClock(derived.sessionElapsedMinutes)}</strong>
        </p>
        <p className="readonly-id">
          {dictionary.runId}: {context.run.id}
        </p>
        <button type="button" onClick={onBackToTraining}>
          {dictionary.backToTraining}
        </button>
      </main>
    );
  }

  const deltaMinutes = derived.scheduleDeltaMinutesValue;
  const isBehind = deltaMinutes !== undefined && deltaMinutes > 0;
  const deltaClock = deltaMinutes !== undefined ? formatMinutesAsClock(Math.abs(deltaMinutes)) : null;
  const deltaDetail =
    deltaClock !== null ? `${deltaClock} ${isBehind ? dictionary.minBehind : dictionary.beforeCheckpoint}` : null;

  const step = derived.currentStep;
  const sections = step ? deriveFacilitationSections(step) : null;
  const nextPreview = derived.currentStepId ? deriveNextPreview(context.session, derived.currentStepId) : null;
  const stepNotes = context.run.notes
    .filter((note) => note.stepId === derived.currentStepId)
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return (
    <main className={`screen instructor-mode-screen im-emphasis-${sections?.emphasis ?? "quiet"}`}>
      {derived.paused && <div className="im-paused-badge">{dictionary.paused}</div>}

      {showRecoveredBanner && (
        <div className="im-recovered-banner">
          <span>{dictionary.recoveredBanner}</span>
          <button type="button" onClick={() => setShowRecoveredBanner(false)}>
            {dictionary.dismiss}
          </button>
        </div>
      )}

      <header className="im-status-bar">
        <div className="im-status-title">{context.session.title}</div>
        <div className="im-status-row">
          <div className="im-status-block">
            <span className="im-status-label">{dictionary.session}</span>
            <span className="im-status-value">{formatMinutesAsClock(derived.sessionElapsedMinutes)}</span>
          </div>
          <div className="im-status-block">
            <span className="im-status-label">{dictionary.step}</span>
            <span className="im-status-value">
              {derived.stepNumber ? `${String(derived.stepNumber).padStart(2, "0")} / ${derived.stepCount}` : "—"}
            </span>
            {derived.stepElapsedMinutes !== undefined && (
              <span className="im-status-subvalue">{formatMinutesAsClock(derived.stepElapsedMinutes)}</span>
            )}
          </div>
          <div className="im-status-block">
            <span className="im-status-label">{dictionary.status}</span>
            {deltaDetail ? (
              <>
                <span className={isBehind ? "im-status-value im-behind" : "im-status-value im-on-plan"}>
                  {isBehind ? dictionary.behind : dictionary.onPlan}
                </span>
                <span className="im-status-subvalue">{deltaDetail}</span>
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
          {dictionary.openPresentation}
        </button>
      )}

      {step && sections ? (
        <div className="im-layout">
          <section className="im-step-content">
            {sections.safety.length > 0 && (
              <div className="im-field-block im-safety-strip">
                <h2>{dictionary.doNotReveal}</h2>
                <ul>
                  {sections.safety.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="im-step-meta">
              {formatStepTypeLabel(dictionary, step.type)}
              {step.slideRef !== undefined ? ` · ${dictionary.slide} ${step.slideRef}` : ""}
            </p>
            <h1 className="im-step-title">{step.title}</h1>

            {sections.now && (
              <div className="im-field-block im-now">
                <h2>{dictionary.now}</h2>
                <p className="im-now-text">{sections.now}</p>
                {sections.remainingActions.length > 0 && (
                  <ul className="im-remaining-actions">
                    {sections.remainingActions.map((action, index) => (
                      <li key={index}>{action}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {sections.sayFrame && (
              <div className="im-field-block im-frame">
                <h2>{dictionary.frame}</h2>
                <p>“{sections.sayFrame}”</p>
              </div>
            )}

            {(sections.ask.length > 0 || sections.followUpQuestions.length > 0 || sections.listenFor.length > 0) && (
              <div className="im-field-block im-discussion-cluster">
                {sections.ask.length > 0 && (
                  <div className="im-discussion-part">
                    <h2>{dictionary.ask}</h2>
                    <ul>
                      {sections.ask.map((question, index) => (
                        <li key={index}>{question}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {sections.followUpQuestions.length > 0 && (
                  <div className="im-discussion-part">
                    <h2>{dictionary.followUp}</h2>
                    <ul>
                      {sections.followUpQuestions.map((question, index) => (
                        <li key={index}>{question}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {sections.listenFor.length > 0 && (
                  <div className="im-discussion-part">
                    <h2>{dictionary.listenFor}</h2>
                    <ul>
                      {sections.listenFor.map((cue, index) => (
                        <li key={index}>{cue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {sections.hasChecklist && (
              <div className="im-field-block">
                <h2>{dictionary.checklist}</h2>
                <ul className="im-checklist">
                  {(step.checklist ?? []).map((item) => (
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

            {sections.hasResources && (
              <div className="im-field-block">
                <h2>{dictionary.resources}</h2>
                <ul className="im-resource-list">
                  {(step.resources ?? []).map((resource) => (
                    <li key={resource.id}>
                      <span>
                        {resource.label} · {resource.kind}
                      </span>
                      <button type="button" onClick={() => handleOpenResource(resource.id)} disabled={busy}>
                        {dictionary.open}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections.hasCommand && step.command && (
              <div className="im-field-block">
                <h2>{dictionary.command}</h2>
                <p className="im-command-label">
                  {step.command.label}
                  {step.command.sensitive && <span className="im-sensitive-badge">{dictionary.sensitive}</span>}
                </p>
                <p className="im-command-preview">
                  <code>{step.command.executable}</code>
                  {(step.command.args ?? []).map((arg, index) => (
                    <code key={index}> {arg}</code>
                  ))}
                </p>
                <button
                  type="button"
                  onClick={() => void handleRunCommand(step.command!.id)}
                  disabled={commandStarting || commandExecution?.status === "running"}
                >
                  {dictionary.runCommand}
                </button>
              </div>
            )}

            {sections.hasEvidence && (
              <div className="im-field-block im-evidence">
                <h2>{dictionary.evidence}</h2>
                <ul className="im-evidence-list">
                  {deriveEvidenceStageDisplay(step, derived.currentStepRun).map((stage) => (
                    <li key={stage.id} className={stage.released ? "im-evidence-item released" : "im-evidence-item locked"}>
                      <div className="im-evidence-header">
                        <span className="im-evidence-order">{stage.order}.</span>
                        <span className="im-evidence-label">{stage.label}</span>
                        <span className="im-evidence-status">{stage.released ? dictionary.released : dictionary.locked}</span>
                      </div>
                      {stage.released ? (
                        stage.detail && <p className="im-evidence-detail">{stage.detail}</p>
                      ) : (
                        <button type="button" onClick={() => handleReleaseEvidence(stage.id)} disabled={busy}>
                          {dictionary.release}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections.fallback && (
              <div className="im-field-block im-fallback">
                <h2>{dictionary.fallback}</h2>
                <p>{sections.fallback}</p>
              </div>
            )}

            {sections.transition && (
              <div className="im-field-block im-transition">
                <h2>{dictionary.transition}</h2>
                <p>{sections.transition}</p>
              </div>
            )}

            {sections.hasContext && (
              <div className="im-field-block im-disclosure">
                <button type="button" className="im-disclosure-toggle" onClick={() => setContextOpen((value) => !value)}>
                  {dictionary.context} {contextOpen ? "▾" : "▸"}
                </button>
                {contextOpen && (
                  <div className="im-disclosure-content">
                    {step.objective && <p>{step.objective}</p>}
                    {step.facilitatorGuidance && <p>{step.facilitatorGuidance}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="im-field-block im-disclosure">
              <button type="button" className="im-disclosure-toggle" onClick={() => setNotesOpen((value) => !value)}>
                {dictionary.notes} ({stepNotes.length}) {notesOpen ? "▾" : "▸"}
              </button>
              {notesOpen && (
                <div className="im-disclosure-content">
                  <textarea
                    className="im-notes-input"
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder={dictionary.notesPlaceholder}
                    rows={3}
                  />
                  <button type="button" onClick={() => void handleAddNote()} disabled={busy || noteText.trim().length === 0}>
                    {dictionary.addNote}
                  </button>
                  {stepNotes.length > 0 && (
                    <ul className="im-notes-list">
                      {stepNotes.map((note) => (
                        <li key={note.id}>
                          <span className="im-note-time">{formatNoteTimestamp(note.timestamp)}</span> — {note.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {commandExecution && (
              <section className="im-command-output">
                <h2>{dictionary.commandOutput}</h2>
                <p className="im-command-output-label">{commandExecution.label}</p>
                <p className="im-command-output-status">
                  {commandExecution.status === "running"
                    ? dictionary.running
                    : commandExecution.error
                      ? `${dictionary.failedToStartCommand}: ${commandExecution.error}`
                      : `${dictionary.exitCode}: ${commandExecution.exitCode ?? "—"}`}
                </p>
                {commandExecution.stdout && (
                  <>
                    <h3>{dictionary.stdout}</h3>
                    <pre className="im-command-stream">{commandExecution.stdout}</pre>
                  </>
                )}
                {commandExecution.stderr && (
                  <>
                    <h3>{dictionary.stderr}</h3>
                    <pre className="im-command-stream im-command-stderr">{commandExecution.stderr}</pre>
                  </>
                )}
              </section>
            )}
          </section>

          <aside className="im-side-panel">
            <div className="im-next-preview">
              {nextPreview?.isFinish ? (
                <span className="im-next-label">{dictionary.finishWhenReady}</span>
              ) : (
                <>
                  <span className="im-next-label">{dictionary.next}</span>
                  <p className="im-next-detail">
                    {nextPreview?.slideRef !== undefined ? `${dictionary.slide} ${nextPreview.slideRef} · ` : ""}
                    {nextPreview?.title}
                  </p>
                  {nextPreview?.stepType && <p className="im-next-type">{formatStepTypeLabel(dictionary, nextPreview.stepType)}</p>}
                </>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <section className="im-step-content">
          <p className="empty-state">{derived.stepCount === 0 ? dictionary.noStepsInSession : dictionary.noActiveStep}</p>
        </section>
      )}

      <footer className="im-controls">
        <button
          type="button"
          onClick={() => handleAction(() => window.instructorCopilot.run.previous())}
          disabled={busy || !derived.canGoPrevious}
        >
          {dictionary.previous}
        </button>
        {derived.paused ? (
          <button type="button" onClick={() => handleAction(() => window.instructorCopilot.run.resume())} disabled={busy || !derived.canResume}>
            {dictionary.resume}
          </button>
        ) : (
          <button type="button" onClick={() => handleAction(() => window.instructorCopilot.run.pause())} disabled={busy || !derived.canPause}>
            {dictionary.pause}
          </button>
        )}
        <button type="button" onClick={() => handleAction(() => window.instructorCopilot.run.skip())} disabled={busy || !derived.canSkip}>
          {dictionary.skip}
        </button>
        {derived.hasNextTarget ? (
          <button
            type="button"
            onClick={() => handleAction(() => window.instructorCopilot.run.next())}
            disabled={busy || !derived.canGoNext}
          >
            {dictionary.nextButton}
          </button>
        ) : (
          <button type="button" onClick={handleComplete} disabled={busy || !derived.canComplete}>
            {dictionary.completeSession}
          </button>
        )}
      </footer>
    </main>
  );
}
