import { useLocalSearchParams } from "expo-router";
import { CoachChat } from "../../src/components/coach/CoachChat";
import type { AgentId } from "../../src/api/types";

/** A fresh coach chat, optionally opened on a specific agent with a prefill. */
export default function NewCoachChatScreen() {
  const { agent, q } = useLocalSearchParams<{ agent?: string; q?: string }>();
  const initialAgent: AgentId = agent === "meal" || agent === "training" ? agent : "general";
  return <CoachChat initialAgent={initialAgent} initialMessage={q} />;
}
