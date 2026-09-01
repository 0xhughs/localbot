import { createFileRoute } from "@tanstack/react-router";
import { LocalBotApp } from "@/components/localbot/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LocalBotApp />;
}
