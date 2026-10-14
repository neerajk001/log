import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { Card, Divider, IconBadge, ListRow, Tag } from "../../src/components/ui/primitives";
import type { AgentId } from "../../src/api/types";

/** Section title, with a one-line "what this is for" cue on the right. */
function SectionHead({ title, caption }: { title: string; caption: string }) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={[typography.caption, styles.sectionCaption]}>{caption}</Text>
    </View>
  );
}

/** The AI's home: every coach capability as a first-class entry point. */
export default function CoachHomeScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const openAgent = (agent: AgentId) =>
    router.navigate({ pathname: "/coach/new", params: { agent } } as never);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader variant="detail" title="Coach" onBack={() => router.back()} />

        <View style={styles.intro}>
          <View style={styles.introText}>
            <Text style={styles.introTitle}>Your AI coach</Text>
            <Text style={typography.small}>
              Get personalized advice on training, nutrition and your progress.
            </Text>
          </View>
          <View style={styles.alwaysPill}>
            <View style={styles.alwaysDot} />
            <Text style={styles.alwaysText}>Always here</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <IconBadge
              name="sparkles"
              bg={colors.primary}
              color={colors.onPrimary}
              size={52}
              rounded={false}
            />
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>AI COACH</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>Ask your coach</Text>
          <Text style={[typography.small, styles.heroBody]}>
            Get answers about training, food, recovery, supplements and more.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a conversation"
            onPress={() => openAgent("general")}
            style={({ pressed }) => [styles.heroCta, pressed && styles.pressed]}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.heroCtaText}>Start a conversation</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
          </Pressable>
        </View>

        <SectionHead title="Quick actions" caption="Track and stay consistent" />
        <Card padded={false}>
          <ListRow
            icon="restaurant"
            iconBg={colors.greenSoft}
            iconColor={colors.green}
            iconRounded={false}
            title="Log a meal"
            subtitle="Add your food or snap a photo"
            right={<Tag label="Track nutrition" bg={colors.greenSoft} text={colors.green} />}
            onPress={() => openAgent("meal")}
          />
          <Divider />
          <ListRow
            icon="barbell"
            iconBg={colors.blueSoft}
            iconColor={colors.blue}
            iconRounded={false}
            title="Training & plan"
            subtitle="Review or change your workout plan"
            right={<Tag label="Stay on track" bg={colors.blueSoft} text={colors.blue} />}
            onPress={() => openAgent("training")}
          />
        </Card>

        <SectionHead title="Personalization & history" caption="Make your coach work better for you" />
        <Card padded={false}>
          <ListRow
            icon="options"
            iconRounded={false}
            title="Your goals"
            subtitle="Fitness targets & preferences"
            onPress={() => router.navigate("/coach/onboarding" as never)}
          />
          <Divider />
          <ListRow
            icon="bulb"
            iconRounded={false}
            title="What the coach remembers"
            subtitle="The summary it keeps about you"
            onPress={() => router.navigate("/coach/memory" as never)}
          />
          <Divider />
          <ListRow
            icon="time"
            iconRounded={false}
            title="Chat history"
            subtitle="Reopen and manage past chats"
            onPress={() => router.navigate("/coach/sessions" as never)}
          />
        </Card>

        <Card style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={[typography.small, styles.noteText]}>
            Your coach can see your logs, plan and weekly verdict to give more personalized
            guidance.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },
    pressed: { opacity: 0.85 },

    intro: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    introText: { flex: 1, gap: spacing.xs },
    introTitle: { fontSize: 30, fontWeight: "800", color: t.colors.text, letterSpacing: 0.2 },
    alwaysPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      flexShrink: 0,
    },
    alwaysDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.colors.success },
    alwaysText: { fontSize: 12, fontWeight: "700", color: t.colors.text },

    hero: {
      gap: spacing.sm,
      backgroundColor: t.colors.primarySoft,
      borderWidth: 1,
      borderColor: t.colors.primarySoftBorder,
      borderRadius: radii.xl,
      padding: spacing.lg,
    },
    heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    heroPill: {
      backgroundColor: t.colors.bg,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    heroPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: t.colors.primary },
    heroTitle: { fontSize: 22, fontWeight: "800", color: t.colors.text, marginTop: spacing.xs },
    heroBody: { color: t.colors.textDim },
    heroCta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      height: 52,
      borderRadius: radii.pill,
      backgroundColor: t.colors.primary,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
    },
    heroCtaText: { flex: 1, fontSize: 16, fontWeight: "700", color: t.colors.onPrimary },

    sectionHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    sectionTitle: { fontSize: 17, fontWeight: "700", color: t.colors.text },
    sectionCaption: { color: t.colors.textDim, flexShrink: 1, textAlign: "right" },

    note: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: t.colors.surface,
    },
    noteText: { flex: 1, color: t.colors.textDim },
  }),
);
