import { router, useLocalSearchParams } from "expo-router";
import { CoachChatEntry } from "../../src/components/coach/CoachChatEntry";

export default function CoachTabScreen() {
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
      richLanding
      tabbed
      onBack={() => router.navigate("/(tabs)/today" as never)}
    />
  );
}
