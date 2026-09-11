import { useEffect, useState, type JSX } from "react";
import type { AppInfo, InstructorRunContext } from "../../shared/ipc";
import type { TrainingBundle } from "../../session-engine";
import { HomeScreen } from "./screens/HomeScreen";
import { TrainingDetailScreen } from "./screens/TrainingDetailScreen";
import { SessionEditorScreen } from "./screens/SessionEditorScreen";
import { InstructorModeScreen } from "./screens/InstructorModeScreen";

type View =
  | { name: "home" }
  | { name: "trainingDetail" }
  | { name: "sessionEditor"; sessionId: string }
  | { name: "instructorMode" };

export function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [bundle, setBundle] = useState<TrainingBundle | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [runContext, setRunContext] = useState<InstructorRunContext | null>(null);

  useEffect(() => {
    window.instructorCopilot
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
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
    setView({ name: "instructorMode" });
  }

  function handleRunContextUpdated(context: InstructorRunContext): void {
    setRunContext(context);
  }

  function handleBackToTrainingFromRun(): void {
    setRunContext(null);
    setView({ name: "trainingDetail" });
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
  } else {
    content = runContext ? (
      <InstructorModeScreen
        context={runContext}
        onContextUpdated={handleRunContextUpdated}
        onBackToTraining={handleBackToTrainingFromRun}
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
  }

  return (
    <>
      {content}
      <footer className="app-footer">
        {appInfo ? `${appInfo.name} v${appInfo.version} · ${appInfo.platform}` : "Loading application info…"}
      </footer>
    </>
  );
}
