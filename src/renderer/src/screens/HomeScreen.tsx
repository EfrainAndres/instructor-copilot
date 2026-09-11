import { useState, type JSX } from "react";
import type { TrainingBundle } from "../../../session-engine";

interface HomeScreenProps {
  onTrainingReady: (bundle: TrainingBundle) => void;
}

export function HomeScreen({ onTrainingReady }: HomeScreenProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function handleOpen(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.training.open();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.value.canceled && result.value.bundle) {
        onTrainingReady(result.value.bundle);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await window.instructorCopilot.training.create({
        id: id.trim(),
        title: title.trim(),
        description: description.trim() || undefined
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.value.canceled && result.value.bundle) {
        onTrainingReady(result.value.bundle);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen home-screen">
      <h1>Instructor Copilot</h1>
      <p className="subtitle">A session orchestration companion for instructors and mentors.</p>

      {error && <p className="error-banner">{error}</p>}

      <div className="home-actions">
        <button type="button" onClick={handleOpen} disabled={busy}>
          Open Training
        </button>
        <button type="button" onClick={() => setShowCreateForm((value) => !value)} disabled={busy}>
          Create Training
        </button>
      </div>

      {showCreateForm && (
        <form
          className="create-training-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <div className="field">
            <label>Id</label>
            <input type="text" value={id} onChange={(event) => setId(event.target.value)} required />
          </div>
          <div className="field">
            <label>Title</label>
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <button type="submit" disabled={busy || !id.trim() || !title.trim()}>
            Choose folder and create
          </button>
        </form>
      )}
    </main>
  );
}
