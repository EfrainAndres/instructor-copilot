import { useState, type JSX } from "react";
import type { TrainingBundle } from "../../../session-engine";

interface TrainingDetailScreenProps {
  bundle: TrainingBundle;
  onBundleUpdated: (bundle: TrainingBundle) => void;
  onOpenSession: (sessionId: string) => void;
  onBackToHome: () => void;
}

export function TrainingDetailScreen({
  bundle,
  onBundleUpdated,
  onOpenSession,
  onBackToHome
}: TrainingDetailScreenProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState(bundle.training.title);
  const [description, setDescription] = useState(bundle.training.description ?? "");

  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionDuration, setSessionDuration] = useState(30);

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
                min={0}
                step="any"
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
              </li>
            );
          })}
          {bundle.training.sessionRefs.length === 0 && <li className="empty-state">No sessions yet.</li>}
        </ul>
      </section>
    </main>
  );
}
