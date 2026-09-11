import { useEffect, useState, type JSX } from "react";
import type { ContentRootStatus, InstructorRunContext } from "../../../shared/ipc";
import type { TrainingBundle } from "../../../session-engine";

interface TrainingDetailScreenProps {
  bundle: TrainingBundle;
  onBundleUpdated: (bundle: TrainingBundle) => void;
  onOpenSession: (sessionId: string) => void;
  onBackToHome: () => void;
  onRunStarted: (context: InstructorRunContext) => void;
}

export function TrainingDetailScreen({
  bundle,
  onBundleUpdated,
  onOpenSession,
  onBackToHome,
  onRunStarted
}: TrainingDetailScreenProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState(bundle.training.title);
  const [description, setDescription] = useState(bundle.training.description ?? "");

  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionDuration, setSessionDuration] = useState(30);

  const [contentRoots, setContentRoots] = useState<ContentRootStatus[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.instructorCopilot.training.getContentRootStatus().then((result) => {
      if (!cancelled && result.ok) {
        setContentRoots(result.value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bundle]);

  async function handleReload(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.training.getCurrent();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value) {
        onBundleUpdated(result.value);
        setTitle(result.value.training.title);
        setDescription(result.value.training.description ?? "");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMetadata(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.training.saveMetadata({
        title: title.trim(),
        description: description.trim() || undefined
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onBundleUpdated(result.value);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSession(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.session.create({
        id: sessionId.trim(),
        title: sessionTitle.trim(),
        plannedDurationMinutes: sessionDuration
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onBundleUpdated(result.value);
      setShowCreateSession(false);
      setSessionId("");
      setSessionTitle("");
      setSessionDuration(30);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSession(sessionIdToStart: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.run.start({ sessionId: sessionIdToStart });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRunStarted(result.value);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfigureContentRoot(rootId: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.training.configureContentRoot({ rootId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.value.canceled && result.value.status) {
        setContentRoots(result.value.status);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleClearContentRoot(rootId: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.training.clearContentRoot({ rootId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setContentRoots(result.value);
    } finally {
      setBusy(false);
    }
  }

  const sessionsById = new Map(bundle.sessions.map((session) => [session.id, session]));

  return (
    <main className="screen training-detail-screen">
      <div className="screen-header">
        <button type="button" onClick={onBackToHome}>
          ← Home
        </button>
        <button type="button" onClick={handleReload} disabled={busy}>
          Reload Training
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <section className="training-metadata">
        <p className="readonly-id">Training id: {bundle.training.id}</p>
        <div className="field">
          <label>Title</label>
          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <button type="button" onClick={handleSaveMetadata} disabled={busy || !title.trim()}>
          Save Training
        </button>
      </section>

      <section className="content-roots-section">
        <h2>Content Roots</h2>
        {contentRoots.length === 0 ? (
          <p className="empty-state">No filesystem-rooted Resources are referenced by this Training's Sessions.</p>
        ) : (
          <ul className="content-root-list">
            {contentRoots.map((rootStatus) => (
              <li key={rootStatus.id} className="content-root-item">
                <span className="content-root-id">{rootStatus.id}</span>
                <span className={rootStatus.configured ? "content-root-status configured" : "content-root-status"}>
                  {rootStatus.configured ? "Configured" : "Not configured"}
                </span>
                <button type="button" onClick={() => handleConfigureContentRoot(rootStatus.id)} disabled={busy}>
                  {rootStatus.configured ? "Change" : "Configure"}
                </button>
                {rootStatus.configured && (
                  <button type="button" onClick={() => handleClearContentRoot(rootStatus.id)} disabled={busy}>
                    Clear
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sessions-section">
        <div className="screen-header">
          <h2>Sessions</h2>
          <button type="button" onClick={() => setShowCreateSession((value) => !value)}>
            Create Session
          </button>
        </div>

        {showCreateSession && (
          <form
            className="create-session-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateSession();
            }}
          >
            <div className="field">
              <label>Id</label>
              <input type="text" value={sessionId} onChange={(event) => setSessionId(event.target.value)} required />
            </div>
            <div className="field">
              <label>Title</label>
              <input
                type="text"
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Planned duration (minutes)</label>
              <input
                type="number"
                min={0.01}
                step="any"
                required
                value={sessionDuration}
                onChange={(event) => setSessionDuration(Number(event.target.value))}
              />
            </div>
            <button type="submit" disabled={busy || !sessionId.trim() || !sessionTitle.trim()}>
              Create
            </button>
          </form>
        )}

        <ul className="session-list">
          {bundle.training.sessionRefs.map((sessionRef) => {
            const session = sessionsById.get(sessionRef);
            if (!session) return null;
            return (
              <li key={sessionRef} className="session-list-item">
                <span className="session-title">{session.title}</span>
                <span className="session-meta">
                  {session.plannedDurationMinutes} min · {session.steps.length} step
                  {session.steps.length === 1 ? "" : "s"}
                </span>
                <button type="button" onClick={() => onOpenSession(session.id)}>
                  Edit
                </button>
                <button type="button" onClick={() => handleStartSession(session.id)} disabled={busy}>
                  Start Session
                </button>
              </li>
            );
          })}
          {bundle.training.sessionRefs.length === 0 && <li className="empty-state">No sessions yet.</li>}
        </ul>
      </section>
    </main>
  );
}
