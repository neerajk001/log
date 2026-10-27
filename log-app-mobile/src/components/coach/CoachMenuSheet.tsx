import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { Sheet } from "../ui/controls";
import { IconBadge, type IoniconName } from "../ui/primitives";
import type { AgentId } from "../../api/types";

type MenuItem = {
  icon: IoniconName;
  title: string;
  subtitle: string;
  onPress: () => void;
};

function Item({ item }: { item: MenuItem }) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={item.onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <IconBadge name={item.icon} bg={colors.greenSoft} color={colors.green} size={38} rounded={false} />
      <View style={styles.itemText}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.itemSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </Pressable>
  );
}

/** The three-dot menu for the coach: conversations, coaching settings, shortcuts. */
export function CoachMenuSheet({
  visible,
  onClose,
  agent,
}: {
  visible: boolean;
  onClose: () => void;
  agent: AgentId;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { height } = useWindowDimensions();

  const openChat = (nextAgent: AgentId, fresh = false) => {
    onClose();
    router.navigate({
      pathname: "/coach/chat",
      params: { agent: nextAgent, q: "", date: "", fresh: fresh ? String(Date.now()) : "" },
    } as never);
  };

  const conversations: MenuItem[] = [
    {
      icon: "chatbubble-ellipses-outline",
      title: "New conversation",
      subtitle: "Start a fresh chat",
      onPress: () => openChat(agent, true),
    },
    {
      icon: "time-outline",
      title: "Chat history",
      subtitle: "Resume previous conversations",
      onPress: () => {
        onClose();
        router.navigate("/coach/sessions" as never);
      },
    },
  ];

  const coaching: MenuItem[] = [
    {
      icon: "locate-outline",
      title: "Goals & coaching profile",
      subtitle: "Your targets and preferences",
      onPress: () => {
        onClose();
        router.navigate("/coach/onboarding" as never);
      },
    },
    {
      icon: "bulb-outline",
      title: "Coach memory",
      subtitle: "What the coach remembers",
      onPress: () => {
        onClose();
        router.navigate("/coach/memory" as never);
      },
    },
  ];

  const quickAccess: MenuItem[] = [
    {
      icon: "restaurant-outline",
      title: "Nutrition",
      subtitle: "Meal logging and food questions",
      onPress: () => openChat("meal"),
    },
    {
      icon: "barbell-outline",
      title: "Training plan",
      subtitle: "Exercises, sets and schedule",
      onPress: () => openChat("training"),
    },
    {
      icon: "stats-chart-outline",
      title: "Progress & check-ins",
      subtitle: "Weekly verdict and trends",
      onPress: () => {
        onClose();
        router.navigate("/(tabs)/insights" as never);
      },
    },
  ];

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: height * 0.8 }}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <IconBadge name="sparkles" bg={colors.greenSoft} color={colors.green} size={44} rounded={false} />
          <View style={styles.headerText}>
            <Text style={styles.title}>AI Coach</Text>
            <Text style={styles.subtitle}>Personalized fitness assistant</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Conversations</Text>
        <View style={styles.group}>
          {conversations.map((item) => (
            <Item key={item.title} item={item} />
          ))}
        </View>

        <Text style={styles.sectionLabel}>Your coaching</Text>
        <View style={styles.group}>
          {coaching.map((item) => (
            <Item key={item.title} item={item} />
          ))}
        </View>

        <Text style={styles.sectionLabel}>Quick access</Text>
        <View style={styles.group}>
          {quickAccess.map((item) => (
            <Item key={item.title} item={item} />
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    content: { paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.sm },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
    headerText: { flex: 1, minWidth: 0, gap: 2 },
    title: { fontSize: 19, fontWeight: "800", color: t.colors.text },
    subtitle: { fontSize: 13, color: t.colors.textDim },
    close: { padding: spacing.xs },
    pressed: { opacity: 0.7 },

    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: t.colors.textDim,
      marginTop: spacing.sm,
    },
    group: { gap: spacing.sm },
    item: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    itemText: { flex: 1, minWidth: 0, gap: 2 },
    itemTitle: { fontSize: 15, fontWeight: "700", color: t.colors.text },
    itemSubtitle: { fontSize: 12, color: t.colors.textDim },
  }),
);
