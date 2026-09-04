import { useEffect, useState } from "react";
import { getAiStatus } from "@/lib/runtime/turn";
import { useLocalBot } from "@/lib/store";
import { Wordmark } from "./logo";
import { Onboarding } from "./onboarding";
import { AppShell } from "./shell";

export function LocalBotApp() {
  const [ready, setReady] = useState(false);
  const onboarded = useLocalBot((s) => s.onboarded);
  const diskLoaded = useLocalBot((s) => s.diskLoaded);
  const setRuntime = useLocalBot((s) => s.setRuntime);
  const refreshFolders = useLocalBot((s) => s.refreshFolders);
  const loadFromDisk = useLocalBot((s) => s.loadFromDisk);

  useEffect(() => {
    const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
    if (useLocalBot.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);

  // Stage 7: the browser copy is chrome only. Roster, chats, onboarding flag,
  // labels and the Safety / model switches come from the sidecar (host index,
  // agents/*/agent.json, chats/, localbot-config.json). A pre-Stage-7 browser
  // copy is migrated to disk once inside loadFromDisk.
  useEffect(() => {
    if (!ready) return;
    void loadFromDisk().then(() => refreshFolders());
  }, [ready, loadFromDisk, refreshFolders]);

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

  if (!ready || !diskLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-fg">
        <Wordmark className="text-lg opacity-80" />
      </div>
    );
  }

  if (!onboarded) return <Onboarding />;
  return <AppShell />;
}
