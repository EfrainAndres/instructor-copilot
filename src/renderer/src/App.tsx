import { useEffect, useState, type JSX } from "react";
import type { AppInfo, InstructorRunContext } from "../../shared/ipc";
import type { TrainingBundle } from "../../session-engine";
import { HomeScreen } from "./screens/HomeScreen";
import { TrainingDetailScreen } from "./screens/TrainingDetailScreen";
import { SessionEditorScreen } from "./screens/SessionEditorScreen";
import { InstructorModeScreen } from "./screens/InstructorModeScreen";
import { RunReportScreen } from "./screens/RunReportScreen";

type View =
  | { name: "home" }
  | { name: "trainingDetail" }
  | { name: "sessionEditor"; sessionId: string }
  | { name: "instructorMode" }
  | { name: "runReport" };

export function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [bundle, setBundle] = useState<TrainingBundle | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [runContext, setRunContext] = useState<InstructorRunContext | null>(null);
  const [justRecovered, setJustRecovered] = useState(false);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  useEffect(() => {
    window.instructorCopilot
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
  }, []);

  // Checked exactly once at startup - never a filesystem scan; main resolves this
  // purely from its own active-run pointer.
  useEffect(() => {
    let cancelled = false;
    window.instructorCopilot
      .run.restore()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setRecoveryError(result.error);
        } else if (result.value) {
          setBundle(result.value.bundle);
          setRunContext(result.value.context);
          setJustRecovered(true);
          setView({ name: "instructorMode" });
        }
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleTrainingReady(nextBundle: TrainingBundle): void {
    setBundle(nextBundle);
    setView({ name: "trainingDetail" });
  }

  function handleBundleUpdated(nextBundle: TrainingBundle): void {
    setBundle(nextBundle);
  }

  function handleBackToHome(): void {
    setView({ name: "home" });
  }

  function handleRunStarted(context: InstructorRunContext): void {
    setRunContext(context);
    setJustRecovered(false);
    setView({ name: "instructorMode" });
  }

  function handleRunContextUpdated(context: InstructorRunContext): void {
    setRunContext(context);
    if (context.run.completedAt) {
      setView({ name: "runReport" });
    }
  }

  function handleBackToTrainingFromRun(): void {
    setRunContext(null);
    setView({ name: "trainingDetail" });
  }

  if (bootstrapping) {
    return (
      <main className="screen bootstrap-screen">
        <p>Loading…</p>
      </main>
    );
  }

  let content: JSX.Element;
  if (view.name === "home" || !bundle) {
    content = <HomeScreen onTrainingReady={handleTrainingReady} />;
  } else if (view.name === "trainingDetail") {
    content = (
      <TrainingDetailScreen
        bundle={bundle}
        onBundleUpdated={handleBundleUpdated}
        onOpenSession={(sessionId) => setView({ name: "sessionEditor", sessionId })}
        onBackToHome={handleBackToHome}
        onRunStarted={handleRunStarted}
      />
    );
  } else if (view.name === "sessionEditor") {
    const session = bundle.sessions.find((candidate) => candidate.id === view.sessionId);
    content = session ? (
      <SessionEditorScreen
        session={session}
        onBundleUpdated={handleBundleUpdated}
        onBack={() => setView({ name: "trainingDetail" })}
      />
    ) : (
      <TrainingDetailScreen
        bundle={bundle}
        onBundleUpdated={handleBundleUpdated}
        onOpenSession={(sessionId) => setView({ name: "sessionEditor", sessionId })}
        onBackToHome={handleBackToHome}
        onRunStarted={handleRunStarted}
      />
    );
  } else if (view.name === "instructorMode") {
    content = runContext ? (
      <InstructorModeScreen
        context={runContext}
        onContextUpdated={handleRunContextUpdated}
        onBackToTraining={handleBackToTrainingFromRun}
        recovered={justRecovered}
      />
    ) : (
      <TrainingDetailScreen
        bundle={bundle}
        onBundleUpdated={handleBundleUpdated}
        onOpenSession={(sessionId) => setView({ name: "sessionEditor", sessionId })}
        onBackToHome={handleBackToHome}
        onRunStarted={handleRunStarted}
      />
    );
  } else {
    content = runContext ? (
      <RunReportScreen context={runContext} onBackToTraining={handleBackToTrainingFromRun} />
    ) : (
      <TrainingDetailScreen
        bundle={bundle}
        onBundleUpdated={handleBundleUpdated}
        onOpenSession={(sessionId) => setView({ name: "sessionEditor", sessionId })}
        onBackToHome={handleBackToHome}
        onRunStarted={handleRunStarted}
      />
    );
  }

  return (
    <>
      {recoveryError && <p className="error-banner recovery-error">Recovery check failed: {recoveryError}</p>}
      {content}
      <footer className="app-footer">
        {appInfo ? `${appInfo.name} v${appInfo.version} · ${appInfo.platform}` : "Loading application info…"}
      </footer>
    </>
  );
}
