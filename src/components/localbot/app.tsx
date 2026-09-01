import { useEffect, useState } from "react";
import { getAiStatus } from "@/lib/runtime/turn";
import { useLocalBot } from "@/lib/store";
import { Wordmark } from "./logo";
import { Onboarding } from "./onboarding";
import { AppShell } from "./shell";

export function LocalBotApp() {
  const [ready, setReady] = useState(false);
  const onboarded = useLocalBot((s) => s.onboarded);
  const setAiAvailable = useLocalBot((s) => s.setAiAvailable);

  useEffect(() => {
    const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
    if (useLocalBot.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (!ready) return;
    void getAiStatus().then((s) => setAiAvailable(s.available));
  }, [ready, setAiAvailable]);

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
