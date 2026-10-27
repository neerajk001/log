import { useEffect, useMemo, useRef, useState } from "react";
import { CoachChat } from "./CoachChat";
import { LoadingState } from "../ui/primitives";
import { useCoachSessions } from "../../hooks/useCoachSessions";
import { useCurrentDate } from "../../hooks/useCurrentDate";
import { localDateOf } from "../../utils/date";
import type { AgentId } from "../../api/types";

/**
 * Resolves which chat the Coach tab should show. Meals reuse one conversation
 * per day; General and Training start a new one on each entry.
 */
export function CoachChatEntry({
  agent,
  q,
  date,
  fresh,
  richLanding,
  chatLanding,
  tabbed,
  onBack,
}: {
  agent?: string;
  q?: string;
  date?: string;
  fresh?: string;
  richLanding?: boolean;
  chatLanding?: boolean;
  tabbed?: boolean;
  onBack?: () => void;
}) {
  const initialAgent: AgentId = agent === "meal" || agent === "training" ? agent : "general";
  const today = useCurrentDate();
  const chatDate = date && date <= today ? date : today;
  const { sessions, loading } = useCoachSessions();

  const isDaily = initialAgent === "meal" && !fresh;
  const dailySession = useMemo(
    () =>
      isDaily
        ? sessions.find((s) => s.agent === "meal" && localDateOf(s.updated_at) === chatDate)
        : undefined,
    [isDaily, sessions, chatDate],
  );

  const [resolvedSessionId, setResolvedSessionId] = useState<string | undefined>(undefined);
  const [lookupSettled, setLookupSettled] = useState(false);
  const resolvedDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (resolvedDateRef.current === chatDate || (isDaily && loading)) return;
    resolvedDateRef.current = chatDate;
    setResolvedSessionId(dailySession?.id);
    setLookupSettled(true);
  }, [chatDate, isDaily, loading, dailySession?.id]);

  if (isDaily && !lookupSettled) return <LoadingState label="Opening today's food log…" />;

  return (
    <CoachChat
      sessionId={resolvedSessionId}
      initialAgent={initialAgent}
      initialMessage={q}
      localDate={chatDate}
      richLanding={richLanding}
      chatLanding={chatLanding}
      tabbed={tabbed}
      onBack={onBack}
    />
  );
}

