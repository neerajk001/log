import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useClerk } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";
import type { ThemePreference } from "../src/theme/colors";
import { radii, spacing } from "../src/theme/spacing";
import { AccountSummary } from "../src/components/AccountSummary";
import { SettingField } from "../src/components/SettingField";
import { SegmentedControl, Chip, ChipRow } from "../src/components/ui/controls";
import { Banner, Button, Card, Divider, ListRow, LoadingState, ErrorState } from "../src/components/ui/primitives";
import { useMe } from "../src/hooks/useMe";
import { useEntitlement } from "../src/hooks/useEntitlement";
import { lightTick, useHapticsPref } from "../src/hooks/useHaptics";
import { clearAllCache } from "../src/api/cache";

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "trueBlack", label: "True Black" },
];

/** Sunday-first, matching the streak's weekday numbering (0 = Sun). */
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, loading, error, update, refetch } = useMe();
  const { signOut } = useClerk();
  const { colors, preference, setPreference, typography } = useTheme();
  const styles = useStyles();
  const { enabled: haptics, setEnabled: setHaptics } = useHapticsPref();
  const [cacheCleared, setCacheCleared] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const { isPro, isTrial, trialDaysLeft } = useEntitlement();

  const planValue = isPro ? (isTrial ? `${trialDaysLeft ?? 0}d` : "Active") : "Free";
  const planSubtitle = isPro
    ? isTrial
      ? `Pro trial · ${trialDaysLeft ?? 0} ${trialDaysLeft === 1 ? "day" : "days"} left.`
      : "Every Pro feature is unlocked."
    : "AI coach, meal scans, plan generation and full analytics.";

  const version = Constants.expoConfig?.version ?? "1.0.0";
  const restDays = useMemo(() => profile?.rest_days ?? [], [profile]);
  const restDaysRef = useRef(restDays);

  useEffect(() => {
    restDaysRef.current = restDays;
  }, [restDays]);

  const saveSetting = useCallback(
    async (patch: Parameters<typeof update>[0]) => {
      setWriteError(null);
      try {
        await update(patch);
        lightTick();
      } catch (err) {
        setWriteError(
          err instanceof Error ? err.message : "Couldn't save that setting. Try again.",
        );
        void refetch();
      }
    },
    [update, refetch],
  );

  const toggleRestDay = (value: number) => {
    const current = restDaysRef.current;
    const next = current.includes(value)
      ? current.filter((d) => d !== value)
      : [...current, value].sort((a, b) => a - b);
    restDaysRef.current = next;
    void saveSetting({ rest_days: next.length > 0 ? next : null });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.sm }]}
        keyboardShouldPersistTaps="handled"
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

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}
        {writeError ? <Banner tone="danger" message={writeError} /> : null}

        <Text style={styles.sectionLabel}>Account</Text>
        <Card padded={false}>
          <View style={styles.profile}>
            <AccountSummary showChevron={false} />
          </View>
          <Divider />
          <ListRow
            icon="locate-outline"
            iconRounded={false}
            title="Goals & coaching profile"
            subtitle="Targets and coaching preferences"
            onPress={() => router.navigate("/coach/onboarding" as never)}
          />
        </Card>
        <Button
          label="Sign out"
          icon="log-out-outline"
          variant="outline"
          onPress={() => signOut().catch(() => {})}
        />

        <Text style={styles.sectionLabel}>Appearance</Text>
        <SegmentedControl
          value={preference}
          onChange={(v) => {
            setPreference(v);
            lightTick();
          }}
          options={APPEARANCE_OPTIONS}
        />
        <Text style={[typography.small, styles.hint]}>
          {preference === "system"
            ? "Following your phone's light/dark setting."
            : preference === "trueBlack"
              ? "Pure-black backgrounds for maximum contrast."
              : preference === "dark"
                ? "Soft charcoal backgrounds, easier on the eyes at night."
                : "Light backgrounds."}
        </Text>

        {loading && !profile ? (
          <LoadingState label="Loading settings…" />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Targets</Text>
            <SettingField
              label="Protein target"
              unit="g"
              value={profile?.protein_target_g ?? null}
              hint="Powers adherence in Insights and your weekly verdict."
              onSave={async (v) => {
                await update({ protein_target_g: v });
              }}
            />
            <SettingField
              label="Calorie target"
              unit="kcal"
              value={profile?.calorie_target ?? null}
              hint="Shown against your daily log and the Nutrition trend."
              onSave={async (v) => {
                await update({ calorie_target: v });
              }}
            />
            <Banner
              tone="info"
              message="Values save when you leave a field. Clear a field to remove the target."
            />
          </>
        )}

        <Text style={styles.sectionLabel}>Training</Text>
        <Card style={styles.restCard}>
          <Text style={typography.bodyStrong}>Rest days</Text>
          <Text style={typography.small}>Days you don&apos;t train. They won&apos;t break your streak.</Text>
          <ChipRow style={styles.restRow}>
            {WEEKDAYS.map((d) => (
              <Chip
                key={d.value}
                label={d.label}
                active={restDays.includes(d.value)}
                onPress={() => toggleRestDay(d.value)}
              />
            ))}
          </ChipRow>
        </Card>

        <Text style={styles.sectionLabel}>Features</Text>
        <Card style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={typography.bodyStrong}>Meal tracking</Text>
            <Text style={typography.small}>Show meals and let the coach log your food.</Text>
          </View>
          <Switch
            value={profile?.meal_tracking_enabled !== false}
            onValueChange={(v) => void saveSetting({ meal_tracking_enabled: v })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </Card>
        <Card style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={typography.bodyStrong}>AI coach</Text>
            <Text style={typography.small}>Show the coach entry points across the app.</Text>
          </View>
          <Switch
            value={profile?.ai_coach_enabled !== false}
            onValueChange={(v) => void saveSetting({ ai_coach_enabled: v })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </Card>

        <Text style={styles.sectionLabel}>Logging</Text>
        <Card style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={typography.bodyStrong}>Track bodyweight</Text>
            <Text style={typography.small}>
              {profile?.track_weight === false
                ? "Off - weigh-ins are hidden and your weekly verdict judges strength and adherence instead."
                : "Weigh-ins, your weight trend, and the weight part of your weekly verdict."}
            </Text>
          </View>
          <Switch
            value={profile?.track_weight !== false}
            onValueChange={(v) => void saveSetting({ track_weight: v })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </Card>
        <Card style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={typography.bodyStrong}>Haptic feedback</Text>
            <Text style={typography.small}>A gentle tick confirms every save.</Text>
          </View>
          <Switch
            value={haptics}
            onValueChange={(v) => {
              setHaptics(v);
              if (v) lightTick();
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </Card>

        <Text style={styles.sectionLabel}>Plan</Text>
        <Card padded={false}>
          <ListRow
            icon="diamond-outline"
            iconBg={colors.primarySoft}
            iconColor={colors.primary}
            title="Repora Pro"
            subtitle={planSubtitle}
            value={planValue}
            onPress={() => router.navigate("/paywall" as never)}
          />
        </Card>

        <Text style={styles.sectionLabel}>Data</Text>
        <Button
          label="Clear cached data"
          icon="refresh"
          variant="outline"
          onPress={() => {
            clearAllCache();
            setCacheCleared(true);
            lightTick();
          }}
        />
        <Text style={[typography.small, styles.hint]}>
          {cacheCleared
            ? "Cache cleared. Fresh data loads on next open."
            : "Removes locally cached responses. Your logged data is never affected."}
        </Text>
        <View style={styles.versionRow}>
          <Text style={typography.small}>App version</Text>
          <Text style={typography.bodyStrong}>{version}</Text>
        </View>

        <Text style={styles.sectionLabel}>About</Text>
        <Card style={styles.aboutCard}>
          <Text style={typography.bodyStrong}>How your verdict works</Text>
          <Text style={styles.aboutLine}>• Weight trend - your 7-day rolling average, week over week.</Text>
          <Text style={styles.aboutLine}>• Strength trend - this week&apos;s top sets vs last week&apos;s, per exercise.</Text>
          <Text style={styles.aboutLine}>• Adherence - days this week you hit your protein target.</Text>
          <Text style={[typography.small, styles.hint]}>
            Rule-based and computed weekly from your own data: Hold Steady, Adjust Calories, or Check
            Recovery. No AI guessing.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.md },
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
    profile: { padding: spacing.md },
    hint: { color: t.colors.textDim },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    toggleText: { flex: 1, gap: 2 },
    restCard: { gap: spacing.sm },
    restRow: { marginTop: spacing.xs },
    versionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    aboutCard: { gap: spacing.sm },
    aboutLine: { ...t.typography.small, color: t.colors.text, lineHeight: 19 },
  }),
);
