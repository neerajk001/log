import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";
import { radii, spacing } from "../src/theme/spacing";
import { AccountSummary } from "../src/components/AccountSummary";
import type { IoniconName } from "../src/components/ui/primitives";

const VERSION = Constants.expoConfig?.version ?? "1.0.0";

function SettingsRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  last?: boolean;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <>
      <View style={styles.row}>
        <Ionicons name={icon} size={19} color={colors.textDim} />
        <Text style={[typography.body, styles.label]} numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
      {last ? null : <View style={styles.rowDivider} />}
    </>
  );
}

/** Settings shell - visual rows only; actions are intentionally not wired yet. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={[typography.h1, styles.title]}>Settings</Text>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.profile}>
            <AccountSummary />
          </View>
          <View style={styles.rowDivider} />
          <SettingsRow icon="person-outline" label="Edit profile" />
          <SettingsRow icon="create-outline" label="Units & preferences" />
          <SettingsRow icon="locate-outline" label="Goals" last />
        </View>

        <Text style={styles.sectionLabel}>App settings</Text>
        <View style={styles.card}>
          <SettingsRow icon="notifications-outline" label="Notifications" />
          <SettingsRow icon="color-palette-outline" label="Appearance" value="Dark" />
          <SettingsRow icon="shield-checkmark-outline" label="Data & privacy" />
          <SettingsRow icon="globe-outline" label="Language" value="English" last />
        </View>

        <Text style={styles.sectionLabel}>Integrations</Text>
        <View style={styles.card}>
          <SettingsRow icon="heart-outline" label="Health apps" value="Apple Health, Google Fit" />
          <SettingsRow icon="watch-outline" label="Connect devices" value="Smart scale, Fitness band" last />
        </View>

        <Text style={styles.sectionLabel}>Other</Text>
        <View style={styles.card}>
          <SettingsRow icon="help-circle-outline" label="Help & support" />
          <SettingsRow icon="chatbubble-ellipses-outline" label="Send feedback" />
          <SettingsRow icon="information-circle-outline" label="About" value={`v${VERSION}`} last />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xxxl },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    back: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    pressed: { opacity: 0.7 },
    title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },

    sectionLabel: {
      ...t.typography.small,
      color: t.colors.textDim,
      fontWeight: "600",
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      overflow: "hidden",
    },
    profile: { padding: spacing.md },
    row: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    label: { flex: 1, minWidth: 0 },
    value: { fontSize: 12, color: t.colors.textDim, flexShrink: 1, maxWidth: "52%", textAlign: "right" },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
      marginLeft: spacing.md + 19 + spacing.md,
    },
  }),
);
