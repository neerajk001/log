import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useClerk, useUser } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";
import type { ThemePreference } from "../src/theme/colors";
import { spacing } from "../src/theme/spacing";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { SettingField } from "../src/components/SettingField";
import { SegmentedControl, Chip, ChipRow } from "../src/components/ui/controls";
import { Banner, Button, Card, Divider, IconBadge, ListRow, LoadingState, ErrorState } from "../src/components/ui/primitives";
import { useMe } from "../src/hooks/useMe";
import { lightTick, useHapticsPref } from "../src/hooks/useHaptics";
import { setDevPreview } from "../src/state/onboarding";
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

/** Settings — account, appearance, targets, logging prefs, data, about. */
export default function SettingsScreen() {
  const { profile, loading, error, update, refetch } = useMe();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { colors, preference, setPreference, typography } = useTheme();
  const styles = useStyles();
  const { enabled: haptics, setEnabled: setHaptics } = useHapticsPref();
  const [cacheCleared, setCacheCleared] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const version = Constants.expoConfig?.version ?? "1.0.0";

  const restDays = profile?.rest_days ?? [];
  const toggleRestDay = (value: number) => {
    const next = restDays.includes(value)
      ? restDays.filter((d) => d !== value)
      : [...restDays, value].sort((a, b) => a - b);
    update({ rest_days: next.length > 0 ? next : null }).catch(() => {});
    lightTick();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader variant="detail" title="Settings" onBack={() => router.back()} />

        {error ? <ErrorState message={error} onRetry={refetch} /> : null}

        <Text style={styles.sectionLabel}>Account</Text>
        <Card style={styles.accountCard}>
          <IconBadge name="person" bg={colors.surfaceAlt} color={colors.textDim} size={44} rounded={false} />
          <View style={styles.accountText}>
            <Text style={typography.bodyStrong} numberOfLines={1}>
              {email ?? "Signed in"}
            </Text>
            <Text style={typography.small}>Your logs sync to this account.</Text>
          </View>
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
              hint="Powers the adherence signal in Insights and your weekly verdict."
              onSave={async (v) => {
                await update({ protein_target_g: v });
              }}
            />
            <SettingField
              label="Calorie target"
              unit="kcal"
              value={profile?.calorie_target ?? null}
              hint="Used as a reference in your daily log."
              onSave={async (v) => {
                await update({ calorie_target: v });
              }}
            />

            <Banner
              tone="info"
              message="Values save automatically when you leave a field. Clear a field to remove the target."
            />
          </>
        )}

        <Text style={styles.sectionLabel}>AI Coach</Text>
        <Card padded={false}>
          <ListRow
            icon="sparkles"
            iconBg={colors.primarySoft}
            iconColor={colors.primary}
            title="Chat with coach"
            subtitle="Ask about your training, food or progress."
            onPress={() => router.navigate({ pathname: "/coach/new", params: { agent: "general" } } as never)}
          />
          <Divider />
          <ListRow
            icon="options-outline"
            title="Your goals & coaching profile"
            subtitle="Answer a few questions so your coach can build a plan."
            onPress={() => router.navigate("/coach/onboarding" as never)}
          />
          <Divider />
          <ListRow
            icon="bulb-outline"
            title="What the coach remembers"
            subtitle="The summary your coach keeps about you."
            onPress={() => router.navigate("/coach/memory" as never)}
          />
          <Divider />
          <ListRow
            icon="time-outline"
            title="Chat history"
            subtitle="Reopen and manage past conversations."
            onPress={() => router.navigate("/coach/sessions" as never)}
          />
        </Card>

        <Text style={styles.sectionLabel}>Training</Text>
        <Card style={styles.restCard}>
          <Text style={typography.bodyStrong}>Rest days</Text>
          <Text style={typography.small}>
            {"Days you don't train. They won't break your streak."}
          </Text>
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
            onValueChange={(v) => {
              update({ meal_tracking_enabled: v }).catch(() => {});
              lightTick();
            }}
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
            onValueChange={(v) => {
              update({ ai_coach_enabled: v }).catch(() => {});
              lightTick();
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </Card>

        <Text style={styles.sectionLabel}>Logging</Text>
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
        <Text style={[typography.small, styles.hint]}>
          Lift sets save automatically about a second after you stop typing.
        </Text>

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
          <Text style={styles.aboutLine}>• Weight trend — your 7-day rolling average, week over week.</Text>
          <Text style={styles.aboutLine}>{"• Strength trend — this week\u2019s top sets vs last week\u2019s, per exercise."}</Text>
          <Text style={styles.aboutLine}>• Adherence — days this week you hit your protein target.</Text>
          <Text style={[typography.small, styles.hint]}>
            Rule-based and computed weekly from your own data — Hold Steady, Adjust Calories, or Check
            Recovery. No AI guessing.
          </Text>
        </Card>

        {__DEV__ ? (
          <>
            <Text style={styles.sectionLabel}>Developer</Text>
            <Card padded={false}>
              <ListRow
                icon="sparkles-outline"
                title="Run onboarding"
                subtitle="Open the welcome screen"
                onPress={() => {
                  setDevPreview(true);
                  update({ onboarded: false }).catch(() => {});
                  router.navigate("/onboarding/welcome" as never);
                }}
              />
              <Divider />
              <ListRow
                icon="options-outline"
                title="Onboarding steps"
                subtitle="Jump to the About you step"
                onPress={() => {
                  setDevPreview(true);
                  update({ onboarded: false }).catch(() => {});
                  router.navigate("/onboarding/basics" as never);
                }}
              />
              <Divider />
              <ListRow
                icon="checkmark-done-outline"
                title="Mark onboarding done"
                subtitle="Stop previewing and go to Today"
                onPress={() => {
                  setDevPreview(false);
                  update({ onboarded: true }).catch(() => {});
                  router.replace("/(tabs)/today" as never);
                }}
              />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.md },
    sectionLabel: { ...t.typography.caption, color: t.colors.textDim, marginTop: spacing.sm },
    hint: { color: t.colors.textDim },
    accountCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    accountText: { flex: 1, gap: 2 },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    toggleText: { flex: 1, gap: 2 },
    restCard: { gap: spacing.sm },
    restRow: { marginTop: spacing.xs },
    versionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    aboutCard: { gap: spacing.sm },
    aboutLine: { ...t.typography.small, color: t.colors.text, lineHeight: 19 },
  }),
);
