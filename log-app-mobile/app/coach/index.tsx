import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Card, Divider, ListRow } from "../../src/components/ui/primitives";
import { useCoachSessions } from "../../src/hooks/useCoachSessions";
import { formatMediumDate } from "../../src/utils/date";
import type { AgentId } from "../../src/api/types";

const AGENT_LABELS: Record<AgentId, string> = {
  general: "General",
  meal: "Meals",
  training: "Training",
};

/** The AI's home: every coach capability as a first-class entry point. */
export default function CoachHomeScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { sessions } = useCoachSessions();

  const openAgent = (agent: AgentId) =>
    router.navigate({ pathname: "/coach/new", params: { agent } } as never);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader variant="detail" title="Coach" onBack={() => router.back()} />

        <Text style={styles.sectionLabel}>Start with</Text>
        <Card padded={false}>
          <ListRow
            icon="sparkles"
            iconBg={colors.primarySoft}
            iconColor={colors.primary}
            title="Ask your coach"
            subtitle="Questions about training, food or progress"
            onPress={() => openAgent("general")}
          />
          <Divider />
          <ListRow
            icon="restaurant-outline"
            iconBg={colors.greenSoft}
            iconColor={colors.green}
            title="Log a meal"
            subtitle="Describe what you ate — or snap a photo"
            onPress={() => openAgent("meal")}
          />
          <Divider />
          <ListRow
            icon="barbell-outline"
            iconBg={colors.blueSoft}
            iconColor={colors.blue}
            title="Training & plan"
            subtitle="Review or change your workout plan"
            onPress={() => openAgent("training")}
          />
        </Card>

        <Text style={styles.sectionLabel}>Your coach</Text>
        <Card padded={false}>
          <ListRow
            icon="options-outline"
            title="Your goals"
            subtitle="Answer a few questions so the coach can build a plan"
            onPress={() => router.navigate("/coach/onboarding" as never)}
          />
          <Divider />
          <ListRow
            icon="bulb-outline"
            title="What the coach remembers"
            subtitle="The summary it keeps about you"
            onPress={() => router.navigate("/coach/memory" as never)}
          />
          <Divider />
          <ListRow
            icon="time-outline"
            title="Chat history"
            subtitle="Reopen and manage past chats"
            onPress={() => router.navigate("/coach/sessions" as never)}
          />
        </Card>

        {sessions.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Recent chats</Text>
            <Card padded={false}>
              {sessions.slice(0, 3).map((s, i) => (
                <View key={s.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={s.title}
                    subtitle={`${AGENT_LABELS[s.agent] ?? "General"} · ${formatMediumDate(
                      s.updated_at.slice(0, 10),
                    )}`}
                    onPress={() => router.push(`/coach/${s.id}` as never)}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <Text style={[typography.small, styles.footnote]}>
          Your coach can see your logs, plan and weekly verdict.
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.md },
    sectionLabel: { ...t.typography.caption, color: t.colors.textDim, marginTop: spacing.sm },
    footnote: { color: t.colors.textMuted, marginTop: spacing.sm },
  }),
);
