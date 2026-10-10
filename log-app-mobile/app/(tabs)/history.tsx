import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeUseStyles, useTheme } from "../../src/theme/ThemeContext";
import { radii, spacing } from "../../src/theme/spacing";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { StatTile } from "../../src/components/StatTile";
import { CalendarMonth } from "../../src/components/CalendarMonth";
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconBadge,
  LoadingState,
  Tag,
  type IoniconName,
} from "../../src/components/ui/primitives";
import { Chip, ChipRow, OverflowMenu } from "../../src/components/ui/controls";
import { useHistory, type HistoryDay } from "../../src/hooks/useHistory";
import { usePlans } from "../../src/hooks/usePlans";
import { useCurrentDate } from "../../src/hooks/useCurrentDate";
import { formatLongDate } from "../../src/utils/date";
import { formatNumber, muscleGroupFor } from "../../src/utils/derive";
import { muscleTagStyle } from "../../src/utils/tags";
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
    return `${day.exercises.length}-exercise session`;
  }
  if (day.activities.length > 0) return day.activities[0].name;
  return "Daily log";
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
  const { colors, scheme, typography } = useTheme();
  const styles = useStyles();
  const tagTheme = { colors, scheme };
  const today = useCurrentDate();

  const {
    days,
    stats,
    loading,
    error,
    refetch,
    deleteDailyLog,
    deleteLiftLog,
    deleteActivity,
  } = useHistory(rangeDays);
  const { days: planDays } = usePlans();

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
      {/* FlatList (not ScrollView): "All time" can hold hundreds of days, so
          only the visible window is rendered. */}
      <FlatList
        data={visibleDays}
        keyExtractor={(day) => day.date}
        extraData={openDates}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.primary} />}
        initialNumToRender={6}
        windowSize={7}
        maxToRenderPerBatch={6}
        ListHeaderComponent={
          <>
            <ScreenHeader
              variant="page"
              title="History"
              subtitle="Look back. See how far you've come."
              right={
                <Pressable style={styles.filterChip} onPress={() => setFilterOpen(true)}>
                  <Ionicons name="funnel-outline" size={14} color={colors.text} />
                  <Text style={styles.filterText} numberOfLines={1}>{rangeLabel.replace("Last ", "")}</Text>
                </Pressable>
              }
            />

            {error ? <ErrorState message={error} onRetry={refetch} /> : null}

            {/* Overall stats */}
            <View style={styles.statRow}>
              <View style={styles.statCell}>
                <StatTile icon="barbell-outline" iconBg={colors.purpleSoft} iconColor={colors.purple} value={String(stats.workouts)} label="Workouts" />
              </View>
              <View style={styles.statCell}>
                <StatTile icon="calendar-outline" iconBg={colors.greenSoft} iconColor={colors.green} value={String(stats.daysLogged)} label="Days logged" />
              </View>
              <View style={styles.statCell}>
                <StatTile icon="cube-outline" iconBg={colors.orangeSoft} iconColor={colors.orange} value={formatNumber(stats.totalVolume)} label="Total Volume (kg)" />
              </View>
              <View style={styles.statCell}>
                <StatTile icon="trending-up-outline" iconBg={colors.blueSoft} iconColor={colors.blue} value={strengthLabel} label="Strength" />
              </View>
            </View>

            <CalendarMonth
              month={month}
              onPrevMonth={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}
              onNextMonth={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}
              selected={selectedDate ?? today}
              max={today}
              onSelect={(iso) => setSelectedDate((cur) => (cur === iso ? null : iso))}
              marked={stats.workoutDates}
            />

            {selectedDate ? (
              <ChipRow>
                <Chip label={formatLongDate(selectedDate)} active onPress={() => setSelectedDate(null)} />
                <Chip label="All dates" onPress={() => setSelectedDate(null)} />
              </ChipRow>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loading && days.length === 0 ? (
            <LoadingState label="Loading history…" />
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
          const muscles = Array.from(new Set(day.exercises.map(muscleGroupFor)));
          const title = workoutTitle(day, planDayName);
          const dailySummary = day.daily ? formatDaily(day.daily) : "";

          return (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={typography.bodyStrong}>{formatLongDate(day.date)}</Text>
                {day.lifts.length > 0 ? (
                  <Text style={typography.caption}>
                    {day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"} · {formatNumber(day.volume)} kg
                  </Text>
                ) : null}
              </View>

              <Pressable
                style={styles.workoutCard}
                onPress={() => setOpenDates((prev) => ({ ...prev, [day.date]: !prev[day.date] }))}
              >
                <IconBadge name="barbell-outline" bg={colors.surface} color={colors.textDim} size={44} rounded={false} />
                <View style={styles.workoutText}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    {title}
                  </Text>

                  {muscles.length > 0 ? (
                    <View style={styles.muscleTags}>
                      {muscles.slice(0, 3).map((m) => (
                        <Tag key={m} label={m} bg={muscleTagStyle(m, tagTheme).bg} text={muscleTagStyle(m, tagTheme).text} />
                      ))}
                    </View>
                  ) : null}

                  {day.activities.length > 0 ? (
                    <View style={styles.metaRow}>
                      <Meta
                        icon="walk-outline"
                        value={`${day.activities.length} ${
                          day.activities.length === 1 ? "activity" : "activities"
                        }`}
                      />
                    </View>
                  ) : null}

                  {day.daily ? (
                    <Text style={[typography.caption, styles.dailyLine]} numberOfLines={1}>
                      {dailySummary}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-forward"} size={18} color={colors.textMuted} />
              </Pressable>

              {isOpen ? (
                <Card style={styles.setsCard}>
                  {day.exercises.map((ex) => (
                    <View key={ex} style={styles.exerciseBlock}>
                      <Text style={typography.bodyStrong}>{ex}</Text>
                      {day.lifts
                        .filter((l) => l.exercise_name === ex)
                        .map((l) => (
                          <View key={l.id} style={styles.setRow}>
                            <Text style={typography.small}>
                              {l.weight_kg} kg × {l.reps}
                            </Text>
                            <Pressable
                              onPress={() =>
                                confirm("Delete set?", "This removes the logged set.", () => deleteLiftLog(l.id).catch(() => {}))
                              }
                              hitSlop={14}
                              accessibilityLabel="Delete set"
                            >
                              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                            </Pressable>
                          </View>
                        ))}
                    </View>
                  ))}

                  {day.daily ? (
                    <>
                      {day.exercises.length > 0 ? <Divider /> : null}
                      <View style={styles.setRow}>
                        <View style={styles.dailyText}>
                          <Text style={typography.bodyStrong}>Daily log</Text>
                          <Text style={typography.small}>{dailySummary || "No values"}</Text>
                        </View>
                        <Pressable
                          onPress={() =>
                            confirm("Delete daily log?", "This removes all values for this day.", () => deleteDailyLog(day.date).catch(() => {}))
                          }
                          hitSlop={14}
                          accessibilityLabel="Delete daily log"
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    </>
                  ) : null}

                  {day.activities.length > 0 ? (
                    <>
                      {day.exercises.length > 0 || day.daily ? <Divider /> : null}
                      {day.activities.map((a) => (
                        <View key={a.id} style={styles.setRow}>
                          <View style={styles.dailyText}>
                            <Text style={typography.bodyStrong}>{a.name}</Text>
                            <Text style={typography.small}>
                              {a.duration_min} min
                              {a.distance_km != null ? ` · ${a.distance_km} km` : ""}
                              {a.calories_burned != null ? ` · ${a.calories_burned} kcal` : ""}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() =>
                              confirm("Delete activity?", "This removes the logged activity.", () => deleteActivity(a.id).catch(() => {}))
                            }
                            hitSlop={14}
                            accessibilityLabel="Delete activity"
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                          </Pressable>
                        </View>
                      ))}
                    </>
                  ) : null}
                </Card>
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

function Meta({ icon, value }: { icon: IoniconName; value: string }) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={colors.textDim} />
      <Text style={typography.caption}>{value}</Text>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { padding: spacing.screen, paddingBottom: spacing.xxxl, gap: spacing.lg },

    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      height: 38,
      maxWidth: 170,
      flexShrink: 1,
    },
    filterText: { fontSize: 13, fontWeight: "600", color: t.colors.text, flexShrink: 1 },

    statRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm },
    statCell: { width: "48%" },

    group: { gap: spacing.sm },
    groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    workoutCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: spacing.md,
    },
    workoutText: { flex: 1, gap: 4 },
    muscleTags: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
    metaRow: { flexDirection: "row", gap: spacing.md, marginTop: 2 },
    meta: { flexDirection: "row", alignItems: "center", gap: 3 },
    dailyLine: { color: t.colors.textDim },

    setsCard: { gap: spacing.md },
    exerciseBlock: { gap: spacing.sm },
    setRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    dailyText: { flex: 1, gap: 2 },
  }),
);
