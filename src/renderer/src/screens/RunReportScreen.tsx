import { useMemo, type JSX } from "react";
import type { InstructorRunContext } from "../../../shared/ipc";
import { buildRunReport, type RunReportStepStatus } from "../../../session-engine/run/report";
import { formatMinutesAsClock, formatNoteTimestamp, formatSignedDelta, formatSignedMinutesAsClock } from "../lib/timeFormat";

interface RunReportScreenProps {
  context: InstructorRunContext;
  onBackToTraining: () => void;
}

function formatStepType(type: string): string {
  return type.replace(/_/g, " ");
}

function formatStepStatusLabel(status: RunReportStepStatus): string {
  switch (status) {
    case "on_time":
      return "ON TIME";
    case "over":
      return "OVER";
    case "under":
      return "UNDER";
    case "skipped":
      return "SKIPPED";
    case "not_reached":
      return "NOT REACHED";
  }
}

/**
 * Instructor Copilot's fifth MVP screen (Phase 7): a dedicated Run Report,
 * built entirely from the just-completed run context already returned by
 * `run.complete()` - no reload from disk. Historical timing/status/notes come
 * from `buildRunReport`, which reads only SessionRun's own snapshots so a later
 * edit to the authored Session can never change a completed run's report.
 */
export function RunReportScreen({ context, onBackToTraining }: RunReportScreenProps): JSX.Element {
  const report = useMemo(() => buildRunReport(context.run), [context.run]);
  const overallDelta = formatSignedDelta(report.deltaMinutes);

  return (
    <main className="screen run-report-screen">
      <h1>Run Report</h1>
      <p className="rr-session-title">{report.sessionTitle}</p>
      <p className="readonly-id">Run id: {report.runId}</p>

      <section className="rr-summary">
        <div className="rr-summary-row">
          <div className="rr-summary-block">
            <span className="rr-summary-label">STARTED</span>
            <span className="rr-summary-value">{new Date(report.startedAt).toLocaleString()}</span>
          </div>
          <div className="rr-summary-block">
            <span className="rr-summary-label">COMPLETED</span>
            <span className="rr-summary-value">{new Date(report.completedAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="rr-summary-row">
          <div className="rr-summary-block">
            <span className="rr-summary-label">PLANNED</span>
            <span className="rr-summary-value">{formatMinutesAsClock(report.plannedMinutes)}</span>
          </div>
          <div className="rr-summary-block">
            <span className="rr-summary-label">ACTUAL</span>
            <span className="rr-summary-value">{formatMinutesAsClock(report.actualMinutes)}</span>
          </div>
          <div className="rr-summary-block">
            <span className="rr-summary-label">PAUSED</span>
            <span className="rr-summary-value">{formatMinutesAsClock(report.pausedMinutes)}</span>
          </div>
          <div className="rr-summary-block">
            <span className="rr-summary-label">OVERALL DELTA</span>
            <span className="rr-summary-value">
              {overallDelta.label === "ON TIME" ? "ON TIME" : `${overallDelta.label} ${overallDelta.clock}`}
            </span>
          </div>
        </div>
      </section>

      <section className="rr-steps">
        {report.steps.map((step) => (
          <article key={step.stepId} className={`rr-step-card rr-step-${step.status}`}>
            <div className="rr-step-header">
              <span className="rr-step-order">{String(step.order + 1).padStart(2, "0")}</span>
              <span className="rr-step-title">{step.title}</span>
              <span className="rr-step-status">{formatStepStatusLabel(step.status)}</span>
            </div>
            <p className="rr-step-type">{formatStepType(step.type)}</p>
            <div className="rr-step-timing">
              <div className="rr-step-timing-block">
                <span className="rr-step-timing-label">PLANNED</span>
                <span>{formatMinutesAsClock(step.plannedMinutes)}</span>
              </div>
              <div className="rr-step-timing-block">
                <span className="rr-step-timing-label">ACTUAL</span>
                <span>{formatMinutesAsClock(step.actualMinutes)}</span>
              </div>
              <div className="rr-step-timing-block">
                <span className="rr-step-timing-label">DELTA</span>
                <span>
                  {step.status === "skipped" || step.status === "not_reached"
                    ? "—"
                    : formatSignedMinutesAsClock(step.deltaMinutes)}
                </span>
              </div>
            </div>
            {step.notes.length > 0 && (
              <div className="rr-step-notes">
                <h3>Instructor Notes</h3>
                <ul>
                  {step.notes.map((note) => (
                    <li key={note.id}>
                      <span className="rr-note-time">{formatNoteTimestamp(note.timestamp)}</span> — {note.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </section>

      <footer className="rr-footer">
        <button type="button" onClick={onBackToTraining}>
          Back to Training
        </button>
      </footer>
    </main>
  );
}
