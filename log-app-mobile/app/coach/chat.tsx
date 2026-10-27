import { router, useLocalSearchParams } from "expo-router";
import { CoachChatEntry } from "../../src/components/coach/CoachChatEntry";

export default function CoachChatScreen() {
  const { agent, q, date, fresh } = useLocalSearchParams<{
    agent?: string;
    q?: string;
    date?: string;
    fresh?: string;
  }>();

  return (
    <CoachChatEntry
      key={`${agent ?? "general"}-${q ?? ""}-${date ?? ""}-${fresh ?? ""}`}
      agent={agent}
      q={q}
      date={date}
      fresh={fresh}
      chatLanding
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/coach" as never);
      }}
    />
  );
}
