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

  useEffect(() => {
    const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
    if (useLocalBot.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);

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
