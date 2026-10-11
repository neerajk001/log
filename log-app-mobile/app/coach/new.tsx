import { useEffect, useMemo, useRef, useState } from "react";
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

  /**
   * Resolve today's thread once, then hold on to it.
   *
   * The sessions list refetches whenever the screen regains focus — and opening the camera
   * or photo library takes focus away and gives it back. Letting the resolved id move would
   * remount the chat mid-visit, taking an estimate awaiting confirmation (and its
   * Log it / Dismiss buttons) with it. The key rotates on the date instead, so a midnight
   * rollover still starts the next day's thread.
   */
  const [resolvedSessionId, setResolvedSessionId] = useState<string | undefined>(undefined);
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (resolvedRef.current || (isDaily && loading)) return;
    resolvedRef.current = true;
    setResolvedSessionId(dailySession?.id);
  }, [isDaily, loading, dailySession?.id]);

  // Resolve today's chat before mounting: otherwise the first message would create a
  // second session while the lookup is still in flight.
  if (isDaily && loading) return <LoadingState label="Opening today's food log…" />;

  return (
    <CoachChat
      key={isDaily ? `meal-${today}` : "new"}
      sessionId={resolvedSessionId}
      initialAgent={initialAgent}
      initialMessage={q}
    />
  );
}
