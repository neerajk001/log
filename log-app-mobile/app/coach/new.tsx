import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { CoachChat } from "../../src/components/coach/CoachChat";
import { LoadingState } from "../../src/components/ui/primitives";
import { useCoachSessions } from "../../src/hooks/useCoachSessions";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { localDateOf } from "../../src/utils/date";
import type { AgentId } from "../../src/api/types";

/**
 * A coach chat, opened on a chosen agent with an optional prefill.
 *
 * The Meals chat is ONE conversation per day: opening it reuses today's and it
 * rolls over at midnight, so a day of food logging leaves a single thread in the
 * history instead of one per meal. `?fresh=1` (the ⋯ menu's "New chat") starts
 * another on purpose. General and Training still start a new chat each time.
 */
export default function NewCoachChatScreen() {
  const { agent, q, fresh } = useLocalSearchParams<{
    agent?: string;
    q?: string;
    fresh?: string;
  }>();
  const initialAgent: AgentId = agent === "meal" || agent === "training" ? agent : "general";
  const today = useCurrentDate();
  const { sessions, loading } = useCoachSessions();

  const isDaily = initialAgent === "meal" && !fresh;
  const dailySession = useMemo(
    () =>
      isDaily
        ? sessions.find((s) => s.agent === "meal" && localDateOf(s.updated_at) === today)
        : undefined,
    [isDaily, sessions, today],
  );

  // Resolve today's chat before mounting: otherwise the first message would create
  // a second session while the lookup is still in flight.
  if (isDaily && loading) return <LoadingState label="Opening today's food log…" />;

  return (
    <CoachChat
      key={dailySession?.id ?? "new"}
      sessionId={dailySession?.id}
      initialAgent={initialAgent}
      initialMessage={q}
    />
  );
}
