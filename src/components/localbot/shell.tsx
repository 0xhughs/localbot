import { useEffect } from "react";
import { Menu, Monitor, Plus, Settings as SettingsIcon } from "lucide-react";
import { useLocalBot } from "@/lib/store";
import { isActiveBot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChannelPane } from "./channel";
import { ChatPane } from "./chat";
import { ComputerPane } from "./computer";
import { DesktopTitlebar } from "./desktop-titlebar";
import { EditProfileDialog } from "./edit-profile";
import { NewAgentDialog } from "./new-agent";
import { CommandPalette } from "./palette";
import { PluginsDialog } from "./plugins";
import { RoutinesDialog } from "./routines";
import { SettingsDialog } from "./settings";
import { Sidebar } from "./sidebar";
import { useRoutineTicker } from "@/runtime/routineRunner";

export function AppShell() {
  const setUi = useLocalBot((s) => s.setUi);
  const agentsOpen = useLocalBot((s) => s.ui.agentsOpen);
  const showComputer = useLocalBot((s) => s.ui.showComputer);
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  // Stage 16: a channel is open instead of a 1:1 chat (exactly one of the two is set).
  const selectedChannel = useLocalBot((s) => s.ui.selectedChannelId);
  const bots = useLocalBot((s) => s.bots);
  const diskLoaded = useLocalBot((s) => s.diskLoaded);
  // Stage 15: while this window is open, ask the sidecar for due routines on
  // open and every 30 s; due ones run through runAgentTurn like a typed message.
  useRoutineTicker(diskLoaded);

  useEffect(() => {
    if (!selected && !selectedChannel) {
      const first = bots.find(isActiveBot) ?? bots.find((b) => !b.archived);
      if (first) useLocalBot.getState().selectBot(first.id);
    }
  }, [selected, selectedChannel, bots]);

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <DesktopTitlebar />
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2 md:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Agents"
          onClick={() => setUi({ agentsOpen: !agentsOpen })}
        >
          <Menu className="size-4" />
        </Button>
        <span className="flex-1 text-sm font-medium">LocalBot</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New agent"
          onClick={() => void useLocalBot.getState().startSetupAgent()}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Computer"
          onClick={() => setUi({ showComputer: !showComputer })}
        >
          <Monitor className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          onClick={() => setUi({ showSettings: true })}
        >
          <SettingsIcon className="size-4" />
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div
          className={`${
            agentsOpen ? "flex" : "hidden"
          } absolute inset-0 z-20 md:static md:z-0 md:flex`}
        >
          <Sidebar />
          {agentsOpen && (
            <button
              type="button"
              className="flex-1 bg-bg/50 md:hidden"
              aria-label="Close agents"
              onClick={() => setUi({ agentsOpen: false })}
            />
          )}
        </div>
        {/* Stage 16: the shared thread when a channel is open; the 1:1 chat otherwise. Never both. */}
        {selectedChannel ? <ChannelPane /> : <ChatPane />}
        {showComputer && (
          <>
            <button
              type="button"
              className="absolute inset-0 z-20 bg-bg/40 max-md:hidden"
              aria-label="Close computer"
              onClick={() => setUi({ showComputer: false })}
            />
            <div className="absolute inset-x-0 bottom-0 z-30 flex h-[50%] md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[320px]">
              <ComputerPane />
            </div>
          </>
        )}
      </div>
      <SettingsDialog />
      {/* Stage 14: DSH / Cordis plugins for the isolated DSH_HOME — same dialog style as Settings. */}
      <PluginsDialog />
      {/* Stage 15: routines — disk records, gates on the sidecar, runs through runAgentTurn. */}
      <RoutinesDialog />
      {/* Stage 12: the modal is the Advanced path; + opens a setup chat instead. */}
      <NewAgentDialog />
      <EditProfileDialog />
      <CommandPalette />
    </div>
  );
}
