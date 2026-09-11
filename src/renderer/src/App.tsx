import { useEffect, useState, type JSX } from "react";

interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

export function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    window.instructorCopilot
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
  }, []);

  return (
    <main className="shell">
      <h1>Instructor Copilot</h1>
      <p className="subtitle">A session orchestration companion for instructors and mentors.</p>
      <p className="phase-indicator">Desktop shell ready</p>
      {appInfo ? (
        <dl className="app-info">
          <dt>Name</dt>
          <dd>{appInfo.name}</dd>
          <dt>Version</dt>
          <dd>{appInfo.version}</dd>
          <dt>Platform</dt>
          <dd>{appInfo.platform}</dd>
        </dl>
      ) : (
        <p className="app-info-loading">Loading application info…</p>
      )}
    </main>
  );
}
