import { useEffect, useState } from "react";
import { getAiStatus } from "@/lib/runtime/turn";
import { useLocalBot } from "@/lib/store";
import { Wordmark } from "./logo";
import { Onboarding } from "./onboarding";
import { AppShell } from "./shell";

export function LocalBotApp() {
  const [ready, setReady] = useState(false);
  const onboarded = useLocalBot((s) => s.onboarded);
  const setRuntime = useLocalBot((s) => s.setRuntime);
  const refreshFolders = useLocalBot((s) => s.refreshFolders);
  const ensureAgents = useLocalBot((s) => s.ensureAgents);

  useEffect(() => {
    const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
    if (useLocalBot.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);

  // Folder scopes are server-owned. Load them once, then make sure every agent
  // has its agents/{Name}/private folder (covers sessions migrated from the
  // single-company-root layout; nothing old is moved).
  useEffect(() => {
    if (!ready || !onboarded) return;
    void refreshFolders().then((folders) => {
      if (!folders) return;
      const s = useLocalBot.getState();
      if (s.bots.some((b) => !b.privatePath)) void ensureAgents();
    });
  }, [ready, onboarded, refreshFolders, ensureAgents]);

  useEffect(() => {
    if (!ready) return;
    void getAiStatus().then((s) =>
      setRuntime({
        aiAvailable: s.available,
        model: s.model,
        engine: s.engine,
        ggufPath: s.ggufPath,
        loopback: s.loopback,
        ramEstimate: s.ramEstimate,
        badge: s.badge,
      }),
    );
  }, [ready, setRuntime]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-fg">
        <Wordmark className="text-lg opacity-80" />
      </div>
    );
  }

  if (!onboarded) return <Onboarding />;
  return <AppShell />;
}
