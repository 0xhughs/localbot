import { useEffect, useState } from "react";
import { useLocalBot } from "@/lib/store";
import { Wordmark } from "./logo";
import { Onboarding } from "./onboarding";
import { AppShell } from "./shell";

export function LocalBotApp() {
  const [ready, setReady] = useState(false);
  const onboarded = useLocalBot((s) => s.onboarded);

  useEffect(() => {
    const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
    if (useLocalBot.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);

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
