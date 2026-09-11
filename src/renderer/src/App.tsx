import { useEffect, useState, type JSX } from "react";
import type { AppInfo } from "../../shared/ipc";
import type { TrainingBundle } from "../../session-engine";
import { HomeScreen } from "./screens/HomeScreen";
import { TrainingDetailScreen } from "./screens/TrainingDetailScreen";
import { SessionEditorScreen } from "./screens/SessionEditorScreen";

type View = { name: "home" } | { name: "trainingDetail" } | { name: "sessionEditor"; sessionId: string };

export function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [bundle, setBundle] = useState<TrainingBundle | null>(null);
  const [view, setView] = useState<View>({ name: "home" });

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
      />
    );
  } else {
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
