import { useLocalSearchParams } from "expo-router";
import { CoachChat } from "../../src/components/coach/CoachChat";

/** An existing coach chat, opened from the history list. */
export default function CoachChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CoachChat sessionId={id} />;
}
