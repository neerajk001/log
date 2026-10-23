import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ErrorBoundaryProps } from "expo-router";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { CalendarMonth } from "../../src/components/CalendarMonth";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  IconBadge,
  LoadingState,
} from "../../src/components/ui/primitives";
import { OverflowMenu } from "../../src/components/ui/controls";
import { useHistory, type HistoryDay } from "../../src/hooks/useHistory";
import { useMonthMarks } from "../../src/hooks/useMonthMarks";
import { usePlans } from "../../src/hooks/usePlans";
import { useMe } from "../../src/hooks/useMe";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { formatLongDate, formatMediumDate, weekdayShort } from "../../src/utils/date";
import { formatNumber } from "../../src/utils/derive";
import { formatLiftSet } from "../../src/utils/plate";
import type { DailyLog } from "../../src/api/types";

const RANGE_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 3650, label: "All time" },
];

function formatDaily(d: DailyLog): string {
  return [
    d.weight_kg != null ? `${d.weight_kg} kg` : null,
    d.calories != null ? `${d.calories} kcal` : null,
    d.protein_g != null ? `${d.protein_g} g` : null,
    d.sleep_hours != null ? `${d.sleep_hours} h` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "PUSH (STRENGTH)" -> "Push"; "LOWER HYPERTROPHY" -> "Lower hypertrophy". */
function prettifyDayName(name: string): string {
  const base = name.split("(")[0].trim().toLowerCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function workoutTitle(day: HistoryDay, planDayName: Map<string, string>): string {
  if (day.lifts.length > 0) {
    const planDayId = day.lifts.find((l) => l.plan_day_id)?.plan_day_id ?? null;
    const name = planDayId ? planDayName.get(planDayId) : null;
    if (name) return prettifyDayName(name);
    if (day.exercises.length === 1) return day.exercises[0];
    return "Workout";
  }
  if (day.activities.length > 0) return day.activities[0].name;
  return "Daily log";
}

/** Same-year dates skip the year so the list stays quiet. */
function historyDate(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4)
    ? `${weekdayShort(iso)}, ${formatMediumDate(iso)}`
    : formatLongDate(iso);
}

/** The one line under a day's title: what kind of day it was. */
function daySummary(day: HistoryDay): string {
  if (day.lifts.length > 0) {
    const sets = `${day.lifts.length} ${day.lifts.length === 1 ? "set" : "sets"}`;
    // A single-exercise day already names the exercise in the title.
    if (day.exercises.length === 1) return sets;
    return `${day.exercises.length} exercises · ${sets}`;
  }
  if (day.activities.length > 0) {
    const count = day.activities.length;
    const minutes = day.activities.reduce((sum, a) => sum + a.duration_min, 0);
    return `${count} ${count === 1 ? "activity" : "activities"} · ${minutes} min`;
  }
  return day.daily ? formatDaily(day.daily) : "";
}

export default function HistoryScreen() {
  const [rangeDays, setRangeDays] = useState(90);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const { colors } = useTheme();
  const styles = useStyles();
  const today = useCurrentDate();
  const { profile } = useMe();
  const proteinTarget = profile?.protein_target_g ?? null;

  const {
    days,
    stats,
    loading,
    error,
    mutationError,
    clearMutationError,
    refetch,
    deleteDailyLog,
    deleteLiftLog,
    deleteActivity,
  } = useHistory(rangeDays);
  const { days: planDays } = usePlans();
  // Marks follow the month you're looking at, not the time filter.
  const marked = useMonthMarks(month);

  // Nothing has landed yet: placeholders rather than zeros that read as real.
  const firstLoad = loading && days.length === 0;

  const planDayName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of planDays) map.set(d.id, d.day_name);
    return map;
  }, [planDays]);

  const rangeLabel = RANGE_OPTIONS.find((o) => o.days === rangeDays)?.label ?? "All time";

  const visibleDays = useMemo(
    () => (selectedDate ? days.filter((d) => d.date === selectedDate) : days),
    [days, selectedDate],
  );

  const strengthLabel =
    stats.strengthPct == null ? "—" : `${stats.strengthPct > 0 ? "+" : ""}${stats.strengthPct}%`;

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        variant="page"
        title="History"
        right={
          <Pressable style={styles.filterChip} onPress={() => setFilterOpen(true)}>
            <Ionicons name="funnel-outline" size={14} color={colors.text} />
            <Text style={styles.filterText} numberOfLines={1}>
              {rangeLabel.replace("Last ", "")}
            </Text>
          </Pressable>
        }
      />

      {/* FlatList (not ScrollView): "All time" can hold hundreds of days, so
          only the visible window is rendered. */}
      <FlatList
        data={visibleDays}
        keyExtractor={(day) => day.date}
        extraData={openDates}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.primary} />
        }
        initialNumToRender={6}
        windowSize={7}
        maxToRenderPerBatch={6}
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? <ErrorState message={error} onRetry={refetch} /> : null}
            {mutationError ? (
              <Banner
                tone="warning"
                message={mutationError}
                actionLabel="Dismiss"
                onAction={clearMutationError}
              />
            ) : null}

            {/* One compact strip instead of four tall tiles. */}
            <View style={styles.statsCard}>
              <RangeStat label="Workouts" value={firstLoad ? "—" : String(stats.workouts)} />
              <View style={styles.statDivider} />
              <RangeStat label="Days" value={firstLoad ? "—" : String(stats.daysLogged)} />
              <View style={styles.statDivider} />
              <RangeStat
                label="Volume kg"
                value={firstLoad ? "—" : formatNumber(stats.totalVolume)}
              />
              <View style={styles.statDivider} />
              <RangeStat label="Strength" value={firstLoad ? "—" : strengthLabel} />
            </View>

            <CalendarMonth
              month={month}
              onPrevMonth={() =>
                setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))
              }
              onNextMonth={() =>
                setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))
              }
              selected={selectedDate ?? today}
              max={today}
              onSelect={(iso) => setSelectedDate((cur) => (cur === iso ? null : iso))}
              marked={marked}
            />

            {selectedDate ? (
              <View style={styles.selectedBar}>
                <Ionicons name="calendar-outline" size={13} color={colors.textDim} />
                <Text style={styles.selectedText} numberOfLines={1}>
                  {historyDate(selectedDate, today)}
                </Text>
                <Pressable
                  onPress={() => setSelectedDate(null)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Show all dates"
                >
                  <Text style={styles.clearText}>Show all</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading && days.length === 0 ? (
            <LoadingState label="Loading history…" />
          ) : selectedDate ? (
            <EmptyState
              icon="calendar-outline"
              title="Nothing on this day"
              subtitle="Pick another date, or show all dates."
            />
          ) : (
            <EmptyState
              icon="time-outline"
              title="Nothing logged yet"
              subtitle="Your lifts, daily values and activities show up here, grouped by day."
            />
          )
        }
        renderItem={({ item: day }) => {
          const isOpen = !!openDates[day.date];
          const title = workoutTitle(day, planDayName);
          const summary = daySummary(day);
          const dailySummary = day.daily ? formatDaily(day.daily) : "";
          const hitProteinTarget =
            proteinTarget != null &&
            day.daily?.protein_g != null &&
            day.daily.protein_g >= proteinTarget;

          return (
            <View style={[styles.dayCard, isOpen && styles.dayCardOpen]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${formatLongDate(day.date)} — ${title}`}
                onPress={() =>
                  setOpenDates((prev) => ({ ...prev, [day.date]: !prev[day.date] }))
                }
                style={({ pressed }) => [styles.dayPress, pressed && styles.pressed]}
              >
                <View style={styles.dayText}>
                  <Text style={styles.dayDate}>{historyDate(day.date, today)}</Text>
                  <Text style={styles.dayTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {summary ? (
                    <Text style={styles.daySummary} numberOfLines={1}>
                      {summary}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={isOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.textMuted}
                />
              </Pressable>

              {isOpen ? (
                <View style={styles.dayBody}>
                  {day.exercises.map((exercise) => (
                    <View key={exercise} style={styles.exerciseBlock}>
                      <Text style={styles.exerciseName}>{exercise}</Text>
                      {day.lifts
                        .filter((l) => l.exercise_name === exercise)
                        .map((l) => (
                          <View key={l.id} style={styles.itemRow}>
                            <Text style={styles.itemValue}>
                              {formatLiftSet(l)}
                            </Text>
                            <DeleteButton
                              label="Delete set"
                              onPress={() =>
                                confirm("Delete set?", "This removes the logged set.", () =>
                                  void deleteLiftLog(l.id),
                                )
                              }
                            />
                          </View>
                        ))}
                    </View>
                  ))}

                  {day.daily ? (
                    <View style={styles.section}>
                      <View style={styles.sectionHead}>
                        <Text style={styles.sectionLabel}>Daily</Text>
                        {hitProteinTarget ? (
                          <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                        ) : null}
                      </View>
                      <View style={styles.itemRow}>
                        <Text style={[styles.itemValue, styles.flexText]}>
                          {dailySummary || "No values"}
                        </Text>
                        <DeleteButton
                          label="Delete daily log"
                          onPress={() =>
                            confirm(
                              "Delete daily log?",
                              "This removes all values for this day.",
                              () => void deleteDailyLog(day.date),
                            )
                          }
                        />
                      </View>
                    </View>
                  ) : null}

                  {day.activities.length > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Activity</Text>
                      {day.activities.map((a) => (
                        <View key={a.id} style={styles.itemRow}>
                          <View style={styles.flexText}>
                            <Text style={styles.itemTitle}>{a.name}</Text>
                            <Text style={styles.itemMeta}>
                              {a.duration_min} min
                              {a.distance_km != null ? ` · ${a.distance_km} km` : ""}
                              {a.calories_burned != null ? ` · ${a.calories_burned} kcal` : ""}
                            </Text>
                          </View>
                          <DeleteButton
                            label="Delete activity"
                            onPress={() =>
                              confirm(
                                "Delete activity?",
                                "This removes the logged activity.",
                                () => void deleteActivity(a.id),
                              )
                            }
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
      />

      <OverflowMenu
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Time filter"
        actions={RANGE_OPTIONS.map((o) => ({
          label: o.label,
          icon: o.days === rangeDays ? "checkmark-circle" : "ellipse-outline",
          onPress: () => setRangeDays(o.days),
        }))}
      />
    </View>
  );
}

/** One column of the range strip — value first, quiet label under it. */
function RangeStat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function DeleteButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: {
      paddingHorizontal: spacing.screen,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxxl,
      gap: spacing.md,
    },
    header: { gap: spacing.md },

    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      height: 36,
      maxWidth: 170,
      flexShrink: 1,
    },
    filterText: { fontSize: 13, fontWeight: "600", color: t.colors.text, flexShrink: 1 },

    statsCard: {
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    statCell: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0 },
    statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginVertical: 2 },
    statValue: { fontSize: 17, fontWeight: "700", color: t.colors.text, lineHeight: 20 },
    statLabel: { ...t.typography.caption, color: t.colors.textMuted },

    selectedBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      height: 36,
    },
    selectedText: { ...t.typography.small, color: t.colors.text, flex: 1 },
    clearText: { ...t.typography.caption, color: t.colors.primary },

    dayCard: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.cardBorder,
      overflow: "hidden",
    },
    dayCardOpen: { borderColor: t.colors.primarySoftBorder },
    dayPress: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.md,
    },
    pressed: { opacity: 0.7 },
    dayText: { flex: 1, gap: 2, minWidth: 0 },
    dayDate: { ...t.typography.caption, color: t.colors.textMuted },
    dayTitle: { ...t.typography.bodyStrong },
    daySummary: { ...t.typography.small, color: t.colors.textDim },

    dayBody: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.md,
    },
    exerciseBlock: { gap: 3 },
    exerciseName: { ...t.typography.small, fontWeight: "700", color: t.colors.text },
    section: { gap: 3 },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    sectionLabel: { ...t.typography.caption, color: t.colors.textMuted, textTransform: "uppercase" },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      minHeight: 20,
    },
    itemValue: { ...t.typography.small, color: t.colors.textDim },
    itemTitle: { ...t.typography.small, fontWeight: "600", color: t.colors.text },
    itemMeta: { ...t.typography.caption, color: t.colors.textMuted },
    flexText: { flex: 1, minWidth: 0 },

    errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
    errorTitle: { textAlign: "center" },
    errorText: { textAlign: "center", color: t.colors.textDim },
  }),
);

/**
 * Route-level fallback (expo-router picks this up): a render crash on History becomes a
 * friendly, retryable card instead of a red box.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, typography } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <View style={styles.errorWrap}>
        <IconBadge name="alert-circle-outline" bg={colors.surface} color={colors.danger} size={56} rounded={false} />
        <Text style={[typography.h3, styles.errorTitle]}>History couldn&apos;t load</Text>
        <Text style={[typography.small, styles.errorText]}>
          {error?.message ?? "Something went wrong on this screen."}
        </Text>
        <Button label="Try again" icon="refresh" onPress={() => void retry()} />
      </View>
    </View>
  );
}
